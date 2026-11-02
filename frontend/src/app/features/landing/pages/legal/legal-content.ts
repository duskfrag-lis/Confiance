export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  title: 'Términos y condiciones',
  intro:
    'Estos términos regulan el uso de Confiance, la plataforma web que conecta a clientes con prestadores de servicios de su zona. Al crear una cuenta aceptas estas condiciones.',
  updated: '15 de octubre de 2026',
  sections: [
    {
      title: '1. Qué hace Confiance',
      paragraphs: [
        'Confiance es un intermediario: facilita que clientes y prestadores se encuentren, acuerden un servicio, lo agenden y se comuniquen. No es parte del contrato de servicio entre ellos ni presta los servicios publicados.',
        'Cada prestador es responsable de la calidad, la seguridad y el cumplimiento de su trabajo, y cada cliente de la información que entrega y del pago acordado.',
      ],
    },
    {
      title: '2. Cuenta y perfiles',
      paragraphs: [
        'Para registrarte debes entregar datos verdaderos: nombres, apellidos, cédula, celular y correo. El correo y la cédula no pueden estar asociados a otra cuenta.',
        'Una cuenta puede tener perfil de cliente, de prestador o ambos, con un solo perfil activo a la vez. Eres responsable de mantener tu contraseña en secreto.',
        'Puedes deshabilitar tu cuenta en cualquier momento si no tienes contrataciones sin cerrar. La cuenta no se elimina: se conserva el historial necesario para la trazabilidad.',
      ],
    },
    {
      title: '3. Publicaciones',
      paragraphs: [
        'Los prestadores publican servicios con título, oficio, descripción, precio y fotos, y pueden cargar evidencias de trabajos realizados. Los clientes pueden publicar necesidades.',
        'Está prohibido publicar contenido falso, ofensivo, ilegal o que no corresponda a un servicio real. Confiance puede retirar el contenido que incumpla estas reglas.',
      ],
    },
    {
      title: '4. Contratación y agenda',
      paragraphs: [
        'Una contratación inicia con la solicitud del cliente, el prestador la acepta o la rechaza y el cliente la confirma. Al confirmarse se genera la cita.',
        'Si el prestador no responde en 48 horas, o el cliente no confirma en 24 horas después de la aceptación, la contratación se cancela automáticamente.',
      ],
    },
    {
      title: '5. Cancelaciones y reagendamiento',
      paragraphs: [
        'La cancelación ordinaria se permite hasta 24 horas antes de la cita e incluye un motivo. Dentro de las últimas 24 horas solo se puede solicitar un nuevo horario, con un máximo de 2 solicitudes por contratación.',
        'La cancelación por fuerza mayor se permite hasta que el servicio esté en curso y queda sujeta a evaluación administrativa.',
      ],
    },
    {
      title: '6. Pagos',
      paragraphs: [
        'El cliente paga el valor total acordado después de que el prestador marca el servicio como finalizado, por PSE a través de la pasarela de pagos o por transferencia directa a la cuenta del prestador.',
        'Confiance no guarda datos de tarjetas ni claves bancarias. En la transferencia el dinero no pasa por la plataforma: solo se registra que el cliente pagó y que el prestador lo confirmó. Como el pago es posterior al servicio, no hay reembolsos.',
      ],
    },
    {
      title: '7. Calificaciones, reclamos y verificación',
      paragraphs: [
        'Solo se califica una contratación completada, una vez por cada parte. Las calificaciones deben ser honestas y respetuosas.',
        'Cualquiera de las partes puede crear un reclamo con evidencia; el equipo lo revisa y registra la resolución. La insignia de identidad verificada solo se muestra cuando un administrador aprueba los documentos del prestador.',
      ],
    },
    {
      title: '8. Cambios a estos términos',
      paragraphs: [
        'Podemos actualizar estos términos. Publicaremos la nueva versión en esta página con su fecha de actualización.',
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Política de tratamiento de datos personales',
  intro:
    'Esta política explica cómo Confiance recolecta, usa y protege tus datos personales, de acuerdo con la Ley 1581 de 2012 y sus decretos reglamentarios.',
  updated: '15 de octubre de 2026',
  sections: [
    {
      title: '1. Responsable',
      paragraphs: [
        'El responsable del tratamiento es Confiance, proyecto desarrollado en la Universidad Católica Luis Amigó.',
      ],
    },
    {
      title: '2. Datos que recolectamos',
      paragraphs: [
        'Datos de identificación y contacto: nombres, apellidos, cédula, celular, correo y, si eres prestador, NIT opcional.',
        'Datos de perfil: foto, descripción, oficios, zonas de atención, disponibilidad e información bancaria para recibir transferencias.',
        'Datos de uso: publicaciones, contrataciones, mensajes del chat, calificaciones, reclamos, pagos registrados y documentos de identidad enviados para la verificación.',
      ],
    },
    {
      title: '3. Para qué los usamos',
      paragraphs: [
        'Crear y administrar tu cuenta, conectar clientes y prestadores, agendar y dar seguimiento a las contrataciones, registrar pagos, atender reclamos, verificar identidades y enviarte notificaciones sobre tu actividad.',
        'También los usamos para mantener la seguridad de la plataforma y conservar la trazabilidad de lo ocurrido.',
      ],
    },
    {
      title: '4. Qué se muestra y qué no',
      paragraphs: [
        'Tu perfil público muestra nombre, foto, oficios, descripción, zonas, disponibilidad, calificaciones y trabajos realizados.',
        'Nunca se muestran públicamente tu cédula, correo, teléfono, documentos de identidad, datos bancarios ni evidencias de reclamos. El cliente solo ve los datos bancarios del prestador mientras tiene con él una contratación entre aceptada y finalizada.',
      ],
    },
    {
      title: '5. Tus derechos',
      paragraphs: [
        'Como titular puedes conocer, actualizar y rectificar tus datos, solicitar prueba de la autorización, ser informado sobre su uso, revocar la autorización y pedir la supresión cuando no exista un deber legal o contractual de conservarlos.',
        'Algunos datos se conservan después de deshabilitar la cuenta, porque son necesarios para la trazabilidad de contrataciones, pagos y reclamos.',
      ],
    },
    {
      title: '6. Seguridad',
      paragraphs: [
        'Las contraseñas se guardan cifradas y nunca en texto plano. Los archivos privados solo se entregan a quien tiene permiso de verlos.',
      ],
    },
    {
      title: '7. Autorización',
      paragraphs: [
        'Al marcar la casilla de aceptación en el registro autorizas el tratamiento de tus datos para las finalidades descritas. Registramos la fecha de esa aceptación.',
      ],
    },
  ],
};
