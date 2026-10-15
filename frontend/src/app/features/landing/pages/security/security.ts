import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { Faq, FaqItem } from '../../components/faq/faq';

interface InfoCard {
  icon: IconName;
  title: string;
  text: string;
}

@Component({
  selector: 'app-security',
  imports: [RouterLink, Icon, Faq],
  templateUrl: './security.html',
  styleUrl: './security.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Security {
  
  protected readonly verification: InfoCard[] = [
    { icon: 'upload', title: 'El prestador envía su documento', text: 'Tipo, número y fotos del documento.' },
    { icon: 'file-text', title: 'Un administrador lo revisa', text: 'Comprueba que la documentación sea válida.' },
    { icon: 'list', title: 'Aprueba, rechaza o pide corrección', text: 'Si rechaza o pide corrección, debe explicar el motivo.' },
    { icon: 'shield-check', title: 'Aparece la insignia', text: 'Solo cuando la verificación está aprobada.' },
  ];

  protected readonly cancelRules = [
    { tone: 'success', title: 'Más de 24 horas antes', text: 'Cancelación ordinaria, con motivo' },
    { tone: 'warning', title: 'Últimas 24 horas', text: 'Solo reagendar' },
    { tone: 'error', title: 'Servicio en curso', text: 'No se puede cancelar de forma ordinaria' },
  ];

  protected readonly privateData: { icon: IconName; title: string }[] = [
    { icon: 'file-text', title: 'Documento de identidad' },
    { icon: 'money', title: 'Datos bancarios' },
    { icon: 'image', title: 'Evidencias de reclamos' },
    { icon: 'lock', title: 'Contacto privado' },
  ];

  protected readonly accountSafety: InfoCard[] = [
    { icon: 'lock', title: 'Contraseñas seguras', text: 'Se guardan protegidas y nunca en texto plano.' },
    { icon: 'mail', title: 'Correo verificado', text: 'Confirmas tu correo con un enlace de verificación.' },
    { icon: 'user', title: 'Cuenta deshabilitada', text: 'No se elimina: se conserva el historial y solo el administrador puede consultarla.' },
  ];

  protected readonly paymentDoes = [
    'Conecta clientes y prestadores',
    'Agenda y registra cada contratación',
    'Permite pagar por transferencia bancaria con PSE',
    'Verifica identidades y revisa reclamos',
  ];

  protected readonly paymentDoesNot = [
    'Pide datos de tarjetas de crédito',
    'Guarda las claves de tu banco',
    'Muestra datos bancarios en vistas públicas',
  ];

  protected readonly clientTips = [
    'Revisa la insignia, las calificaciones y los trabajos aprobados',
    'Coordina los detalles por el chat de la contratación',
    'Confirma la finalización solo cuando el trabajo esté listo',
    'Si algo sale mal, crea un reclamo con fotos',
  ];

  protected readonly providerTips = [
    'Verifica tu identidad para generar más confianza',
    'Confirma tu disponibilidad antes de aceptar',
    'Deja los acuerdos por escrito en el chat',
    'Marca el inicio y la finalización del servicio',
  ];

  protected readonly questions: FaqItem[] = [
    {
      question: '¿Qué pasa si el prestador no llega o el trabajo sale mal?',
      answer:
        'Puedes reportar un problema o crear un reclamo con motivo, descripción y hasta 5 fotos. El equipo lo revisa y registra la resolución.',
    },
    {
      question: '¿Puedo eliminar mi cuenta?',
      answer:
        'Puedes deshabilitarla. No se elimina, para conservar el historial de contrataciones, calificaciones y mensajes, y solo el administrador puede consultarla.',
    },
    {
      question: '¿Quién puede ver mis datos?',
      answer:
        'Tu documento, tus datos bancarios, las evidencias de reclamos y tu contacto privado nunca se muestran en vistas públicas.',
    },
  ];

  protected readonly stars = [1, 2, 3, 4, 5];
}
