import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {

  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null;
  private from: string;

  // Sin una clave real de Resend (re_...) fuera de producción, los correos se escriben en consola
  private consoleOnly: boolean;

  constructor(private config: ConfigService) {

    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';

    this.from = this.config.get<string>('MAIL_FROM') ?? 'Confiance <no-reply@confiance.app>';
    this.consoleOnly = this.config.get('NODE_ENV') !== 'production' && !apiKey.startsWith('re_');
    this.resend = this.consoleOnly ? null : new Resend(apiKey);
  }

  async sendVerificationEmail(to: string, link: string) {

    return this.send(
      to,
      'Verifica tu correo en Confiance',
      `<p>Hola, alguien creó una cuenta en Confiance con este correo.</p>` +
        `<p>Si fuiste tú, verifica tu correo para activarla. El enlace vence en 24 horas.</p>` +
        `<p><a href="${link}">Verificar mi correo</a></p>` +
        `<p>Si no creaste una cuenta en Confiance, ignora este correo y no abras el enlace.</p>`,
      link,
    );
  }

  async sendPasswordResetEmail(to: string, link: string) {

    return this.send(
      to,
      'Restablece tu contraseña',
      `<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Confiance.</p>` +
        `<p>El enlace vence en 30 minutos y solo puede usarse una vez.</p>` +
        `<p><a href="${link}">Restablecer contraseña</a></p>` +
        `<p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>`,
      link,
    );
  }

  private async send(to: string, subject: string, html: string, link: string) {

    if (!this.resend) {

      this.logger.log(`[correo de desarrollo] ${subject} → ${to}: ${link}`);
      return;
    }

    return this.resend.emails.send({ from: this.from, to, subject, html });
  }
}
