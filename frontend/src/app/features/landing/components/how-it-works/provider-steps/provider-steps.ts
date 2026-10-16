import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../../../../shared/components/icon/icon';

type MockKind = 'signup' | 'profile' | 'identity' | 'listing' | 'request' | 'growth';

interface Step {
  title: string;
  text: string;
  bullets: string[];
  mock: MockKind;
}

@Component({
  selector: 'app-provider-steps',
  imports: [Icon],
  templateUrl: './provider-steps.html',
  styleUrl: '../steps.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ProviderSteps {
  protected readonly steps: Step[] = [
    {
      title: 'Regístrate con tu oficio',
      text: 'Crea tu cuenta con tus datos básicos y elige al menos un oficio del catálogo. El NIT es opcional.',
      bullets: ['Elige de 1 a 3 oficios, sin texto libre', 'Verifica tu correo para activar la cuenta'],
      mock: 'signup',
    },
    {
      title: 'Arma tu perfil profesional',
      text: 'Cuenta quién eres y cuándo trabajas para que los clientes te encuentren.',
      bullets: [
        'Foto y descripción de hasta 500 caracteres',
        'Zonas de atención por comuna y barrio',
        'Disponibilidad semanal por bloques: mañana, tarde y noche',
        'Fotos de tus trabajos, publicadas al cargarlas',
      ],
      mock: 'profile',
    },
    {
      title: 'Verifica tu identidad',
      text: 'Envía fotos de tu documento para ganar la insignia de identidad verificada.',
      bullets: [
        'Un administrador revisa tu documentación',
        'Puede aprobarla, rechazarla o pedirte una corrección',
      ],
      mock: 'identity',
    },
    {
      title: 'Publica servicios y postúlate',
      text: 'Ofrece tus servicios con título, precio y fotos, o muestra interés en las necesidades que publican los clientes.',
      bullets: [
        'Precio mínimo y máximo, o precio fijo',
        'De 1 a 5 fotografías por servicio',
        'Filtra las necesidades por categoría y zona',
      ],
      mock: 'listing',
    },
    {
      title: 'Responde solicitudes',
      text: 'Recibes una notificación por cada solicitud. Puedes aceptarla o rechazarla, con un motivo opcional.',
      bullets: ['Tienes 48 horas para responder', 'Al aceptar, tu horario queda bloqueado', 'Coordinas con el cliente por el chat'],
      mock: 'request',
    },
    {
      title: 'Presta el servicio y crece',
      text: 'Marca el inicio cuando comiences. Al finalizar, el cliente te paga por PSE o transferencia, confirma y ambos se califican.',
      bullets: [
        'Cada servicio completado suma a tu reputación',
        'Cuanto más completo tu perfil, más confianza generas',
      ],
      mock: 'growth',
    },
  ];

 
  protected readonly days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  protected readonly week = [
    { block: 'Mañana', on: [true, true, true, true, true, false, false] },
    { block: 'Tarde', on: [true, true, false, true, true, true, false] },
    { block: 'Noche', on: [false, false, false, false, true, true, true] },
  ];
}
