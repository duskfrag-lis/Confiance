import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/errors';
import type { RequestState } from './contracting.constants';

/**
 * Auxiliares de las transacciones sobre una contratación, compartidos por la E5 (contracting) y la E9 (execution):
 * bloquearla y comprobar quién es, fijar el actor de la trazabilidad y moverla de estado.
 */

export const REQUEST_SELECT = {
  service_request_id: true,
  client_id: true,
  provider_profile_id: true,
  source_need_id: true,
  proposed_datetime: true,
  agreed_price: true,
  request_statuses: { select: { status_name: true } },
  provider_profiles: { select: { user_id: true, users: { select: { first_name: true, last_name: true } } } },
  users: { select: { first_name: true, last_name: true } },
  service_listings: { select: { title: true } },
  needs: { select: { title: true } },
} satisfies Prisma.service_requestsSelect;

export type RequestRow = Prisma.service_requestsGetPayload<{ select: typeof REQUEST_SELECT }>;

export type Side = 'client' | 'provider';

export const NOT_FOUND = 'La contratación no existe.';

export const requestState = () =>
  apiError(HttpStatus.CONFLICT, 'REQUEST_STATE', 'Esta contratación cambió de estado; vuelve a cargarla.');

export const fullName = (u: { first_name: string; last_name: string }) => `${u.first_name} ${u.last_name}`;

export const titleOf = (r: RequestRow) => r.service_listings?.title ?? r.needs?.title ?? 'el servicio';

/**
 * Las reglas también están en la base (triggers). Si dos operaciones se cruzan después de la revisión del servicio,
 * la base las frena con una excepción; esto la traduce al error legible que corresponda a su mensaje.
 */
export const dbRuleTranslator = (rules: [string, () => HttpException][]) => (err: unknown) => {

  if (err instanceof HttpException || !(err instanceof Error)) return err;

  const rule = rules.find(([fragment]) => err.message.includes(fragment));
  return rule ? rule[1]() : err;
};

/** Actor de la trazabilidad (audit_events) que escriben los triggers de la solicitud (HU-35.5). */
export async function setActor(tx: Prisma.TransactionClient, userId: bigint) {

  await tx.$queryRaw`SELECT set_config('app.user_id', ${String(userId)}, true)`;
}

/**
 * Bloquea la contratación para que dos operaciones simultáneas no se crucen y la devuelve si el usuario es parte
 * (del lado pedido, o de cualquiera si no se pide). A quien no es parte se le responde 404, sin revelar que existe
 * (HU-38.7).
 */
export async function lockRequest(tx: Prisma.TransactionClient, userId: bigint, requestId: bigint, side?: Side) {

  await setActor(tx, userId);
  await tx.$queryRaw`SELECT 1 FROM service_requests WHERE service_request_id = ${requestId} FOR UPDATE`;

  const request = await tx.service_requests.findUnique({ where: { service_request_id: requestId }, select: REQUEST_SELECT });
  const mine: Side | null = request?.client_id === userId ? 'client' : request?.provider_profiles.user_id === userId ? 'provider' : null;

  if (!request || !mine || (side && mine !== side)) throw new NotFoundException(NOT_FOUND);

  return { request, side: mine };
}

export async function moveTo(tx: Prisma.TransactionClient, requestId: bigint, state: RequestState, data: Prisma.service_requestsUpdateInput = {}) {

  const status = await tx.request_statuses.findUniqueOrThrow({ where: { status_name: state } });

  await tx.service_requests.update({
    where: { service_request_id: requestId },
    data: { ...data, request_statuses: { connect: { request_status_id: status.request_status_id } } },
  });
}

/** Respuesta corta de cada acción: la interfaz recarga el detalle con GET /contracts/:id. */
export function summaryOf(r: RequestRow, state: RequestState) {

  return {
    id: String(r.service_request_id),
    estado: state,
    fechaHora: r.proposed_datetime.toISOString(),
    valor: Number(r.agreed_price),
  };
}
