# Pagos (E9, HU-43 a HU-45)

Código en `backend/src/modules/payments/`. Las reglas viven en la base (migración `20261015000001_hu_v7_pagos_plazos`): solo se paga en FINALIZADO, por el valor acordado, con un intento abierto a la vez y un solo pago PAGADO; la transferencia exige cuenta bancaria del prestador, y al quedar PAGADO con la finalización confirmada la contratación pasa sola a COMPLETADO. El backend revisa quién y cuándo, habla con Wompi y avisa.

## Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/api/payments/mine` | cualquiera | HU-45: el pago de cada contratación propia desde FINALIZADO, el más reciente primero |
| POST | `/api/contracts/:id/payments/transfer` | cliente | HU-44.2: marca la transferencia como hecha (`pending_confirmation`) y avisa al prestador |
| POST | `/api/contracts/:id/payments/transfer/confirm` | prestador | HU-44.3 y HU-44.4: `{ recibida: boolean }`; si llegó, PAGADO; si no, el intento queda rechazado y el cliente puede volver a pagar o reclamar |
| GET | `/api/payments/pse/banks` | cliente | HU-43: bancos de PSE (`{ codigo, nombre }`), en caché una hora |
| GET | `/api/payments/pse/terms` | cliente | HU-43: enlaces a los términos y la autorización de datos de Wompi, que el cliente acepta |
| POST | `/api/contracts/:id/payments/pse` | cliente | HU-43.2: `{ banco, tipoPersona, tipoDocumento, documento, aceptaTerminos: true }`; crea el intento y la transacción en Wompi y devuelve `{ url, estado }` (la URL del banco) |
| POST | `/api/contracts/:id/payments/pse/sync` | las partes | Al volver del banco: consulta en Wompi el PSE abierto y devuelve `{ estado: 'pagado' \| 'rechazado' \| 'pendiente' \| null }` |
| POST | `/api/payments/wompi/events` | Wompi | HU-43.3: webhook `transaction.updated`; se aplica solo con la firma válida y del mismo ambiente |

Errores (409 salvo que se diga otro): `REQUEST_STATE`, `PAYMENT_DONE`, `PAYMENT_IN_PROGRESS`, `NO_BANK_ACCOUNT`, 422 `PAYMENT_GATEWAY` (Wompi no aceptó los datos) y 503 `PAYMENTS_UNAVAILABLE` (sin llaves o Wompi no responde).

## Cómo se resuelve un PSE

1. El intento nace en `pending` con una referencia única (`CONF-<contratación>-<aleatorio>`) y la transacción se crea en Wompi con la firma de integridad.
2. El cliente paga en su banco y vuelve a `/cliente/contrataciones/:id?pago=pse`; la interfaz llama a `sync`.
3. El resultado llega por cualquiera de tres vías, todas idempotentes (un evento repetido no cambia nada):
   - el webhook firmado de Wompi;
   - la consulta al volver del banco;
   - el barrido cada 5 minutos (`PaymentsScheduler`), que además da por fallidos los intentos que nunca llegaron a Wompi (15 min). En local el webhook no llega, así que esta vía y la anterior son las que resuelven.
4. Un APPROVED por un monto distinto al acordado no se da por pagado.

## Configuración

Las cuatro llaves salen del panel de [comercios.wompi.co](https://comercios.wompi.co) (Desarrolladores, en modo Sandbox). Van en `backend/.env` (en el servidor, `backend/.env.production`):

```
WOMPI_ENV=sandbox
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_INTEGRITY_SECRET=test_integrity_...
WOMPI_EVENTS_SECRET=test_events_...
```

- La app valida que los prefijos sean del ambiente elegido (`_test_` con `sandbox`, `_prod_` con `production`) y no arranca si se mezclan.
- Sin llaves la app arranca igual: PSE responde `PAYMENTS_UNAVAILABLE` y la transferencia sigue funcionando.
- En el panel de Wompi, la **URL de eventos** del servidor es `https://<dominio>/api/payments/wompi/events`. En local se deja vacía.

## Probar en sandbox

Con un cliente y una contratación en FINALIZADO: "Pagar con PSE", banco **1** (aprueba) o **2** (rechaza), cualquier documento de 5 a 15 dígitos. En el banco de pruebas se elige el resultado y se vuelve a la contratación.

## Avisos (HU-62)

`transfer_marked` (al prestador), `transfer_confirmed` y `transfer_not_received` (al cliente), `payment_approved` (a las dos partes), `payment_rejected` (al cliente) y `request_completed` (a las dos) cuando el pago cierra la contratación.
