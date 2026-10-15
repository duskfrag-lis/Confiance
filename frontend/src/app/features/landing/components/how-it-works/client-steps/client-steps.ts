import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../../../../shared/components/icon/icon';

type MockKind = 'account' | 'search' | 'compare' | 'request' | 'service' | 'rating';

interface Step {
  title: string;
  text: string;
  bullets: string[];
  mock: MockKind;
}


@Component({
  selector: 'app-client-steps',
  imports: [Icon],
  templateUrl: './client-steps.html',
  styleUrl: '../steps.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ClientSteps {
  protected readonly steps: Step[] = [
    {
      title: 'Crea tu cuenta',
      text: 'Regístrate con tus datos básicos y verifica tu correo para activar tu cuenta.',
      bullets: [
        'Nombres, apellidos, cédula, teléfono y correo',
        'Contraseña segura, con requisitos que se marcan mientras escribes',
        'Te enviamos un enlace de verificación',
      ],
      mock: 'account',
    },
    {
      title: 'Encuentra lo que necesitas',
      text: 'Busca por texto o categoría, o publica tu necesidad y deja que los prestadores te contacten.',
      bullets: [
        'Filtra por zona, precio, calificación, disponibilidad y verificación',
        'Si publicas tu necesidad, eliges entre los prestadores interesados',
      ],
      mock: 'search',
    },
    {
      title: 'Compara y elige',
      text: 'Revisa el perfil público de cada prestador antes de decidir.',
      bullets: [
        'Oficios, zonas, disponibilidad y descripción',
        'Calificación, servicios completados e insignia de verificación',
        'Trabajos realizados ya aprobados',
      ],
      mock: 'compare',
    },
    {
      title: 'Solicita y agenda',
      text: 'Propón fecha y hora dentro de la disponibilidad del prestador. El prestador acepta o rechaza y, al aceptar, tu horario queda reservado.',
      bullets: [
        'Solo ves horarios realmente disponibles',
        'Coordinas los detalles por el chat de la contratación',
        'Cuando ambos confirman, se genera tu cita',
      ],
      mock: 'request',
    },
    {
      title: 'Recibe el servicio',
      text: 'El prestador marca el inicio y la contratación pasa a en curso. Al terminar, confirmas la finalización.',
      bullets: [
        'Tienes 24 horas para confirmar; si no respondes, se completa sola',
        'Si algo sale mal, reporta el problema o crea un reclamo',
      ],
      mock: 'service',
    },
    {
      title: 'Califica al prestador',
      text: 'Cuando el servicio está completado, calificas de 1 a 5 estrellas y puedes dejar un comentario.',
      bullets: ['Tu opinión ayuda a otros clientes', 'Comentario opcional, de hasta 300 caracteres'],
      mock: 'rating',
    },
  ];

  protected readonly stars = [1, 2, 3, 4, 5];
}
