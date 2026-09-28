import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {

  private resend: Resend;

  constructor(private config: ConfigService) {

    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }

  async sendVerificationEmail(to: string, link: string) {

    return this.resend.emails.send({

      from: 'Confiance <no-reply@confiance.app>',
      to,
      subject: 'Verifica tu cuenta',
      html: `<a href="${link}">Verificar cuenta</a>`,
    });
    
  }
}