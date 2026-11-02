import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { Faq, FaqItem } from '../../components/faq/faq';
import { ProfilePreview } from '../../components/profile-preview/profile-preview';

interface InfoCard {
  icon: IconName;
  title: string;
  text: string;
  highlight?: boolean;
}

@Component({

  selector: 'app-providers',
  imports: [RouterLink, Icon, Faq, ProfilePreview],
  templateUrl: './providers.html',
  styleUrl: './providers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class Providers {
  protected readonly benefits: InfoCard[] = [
    { icon: 'briefcase', title: 'Perfil profesional', text: 'Tus oficios, zonas de atención y descripción en un solo lugar.' },
    { icon: 'clipboard', title: 'Solicitudes y necesidades', text: 'Recibe solicitudes y postúlate a las necesidades que publican los clientes.' },
    { icon: 'calendar-check', title: 'Agenda con tu disponibilidad', text: 'Los clientes solo agendan en los bloques que tú defines.' },
    { icon: 'shield-check', title: 'Insignia de verificación', text: 'Verifica tu identidad y genera más confianza.', highlight: true },
    { icon: 'image', title: 'Trabajos realizados', text: 'Sube fotos de tus trabajos; se publican en tu perfil al cargarlas.' },
    { icon: 'star', title: 'Reputación que se ve', text: 'Cada servicio completado suma calificaciones a tu perfil.' },
  ];

  protected readonly steps = [
    { title: 'Regístrate', text: 'Datos básicos y al menos un oficio.' },
    { title: 'Arma tu perfil', text: 'Foto, descripción, zonas y disponibilidad.' },
    { title: 'Verifica tu identidad', text: 'Envía fotos de tu documento para la insignia.' },
    { title: 'Recibe solicitudes', text: 'Acepta y agenda con tus clientes.' },
  ];

  protected readonly signupNeeds = [
    'Nombres y apellidos',
    'Cédula y teléfono celular',
    'Correo electrónico y contraseña',
    'Un oficio principal del catálogo',
    'NIT, que es opcional',
  ];

  protected readonly profileNeeds = [
    'Documento de identidad, para verificarte',
    'Foto y descripción profesional',
    'Zonas de atención y disponibilidad semanal',
    'Trabajos realizados, si quieres mostrarlos',
  ];

 
  protected readonly shown = [
    'Foto y oficios',
    'Descripción y zonas',
    'Disponibilidad general',
    'Calificación promedio',
    'Servicios completados',
    'Insignia y trabajos realizados',
  ];

  protected readonly hidden = ['Datos bancarios', 'Documento de identidad', 'Contacto privado'];

  protected readonly rules: InfoCard[] = [
    {
      icon: 'clock',
      title: 'Cancelación',
      text: 'Puedes cancelar hasta 24 horas antes de la cita, indicando el motivo. Después, solo puedes solicitar reagendar, salvo por fuerza mayor.',
    },
    {
      icon: 'image',
      title: 'Trabajos realizados',
      text: 'Tus evidencias se publican en tu perfil al cargarlas, y puedes retirarlas cuando quieras.',
    },
    {
      icon: 'money',
      title: 'Cómo te pagan',
      text: 'Al finalizar, el cliente paga el total por PSE o por transferencia a tu cuenta. Tus datos bancarios nunca son públicos.',
    },
    {
      icon: 'user',
      title: 'Cuenta deshabilitada',
      text: 'Si dejas de usar la plataforma, puedes deshabilitar tu cuenta. Se conserva tu historial.',
    },
  ];

  protected readonly questions: FaqItem[] = [
    { question: '¿Necesito NIT para registrarme?', answer: 'No. El NIT es opcional al crear tu cuenta.' },
    { question: '¿Cuánto cuesta?', answer: 'Crear tu cuenta y tu perfil no tiene costo.' },
    {
      question: '¿Cómo cobro mis servicios?',
      answer: 'Acuerdas el valor con el cliente. Cuando marcas el servicio como finalizado, el cliente paga el total por PSE o por transferencia a tu cuenta, y tú confirmas que la recibiste.',
    },
    { question: '¿Cuántos oficios puedo tener?', answer: 'De 1 a 3 oficios, elegidos del catálogo de la plataforma.' },
    {
      question: '¿Cómo obtengo la insignia de identidad verificada?',
      answer:
        'Envía fotos de tu documento desde tu perfil. Un administrador lo revisa y puede aprobarlo, rechazarlo o pedirte una corrección.',
    },
    {
      question: '¿Qué zonas puedo elegir?',
      answer: 'Cualquier comuna y barrio del catálogo. Puedes atender varias zonas.',
    },
  ];

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly photos = [1, 2, 3];
}
