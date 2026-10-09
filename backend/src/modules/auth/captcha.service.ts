import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authError } from './auth.constants';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/** Valida en el servidor el token de reCAPTCHA v2 que envía el frontend (HU-68, D-30). */
@Injectable()
export class CaptchaService {

  private readonly logger = new Logger(CaptchaService.name);

  constructor(private config: ConfigService) {}

  async verify(token: string) {

    let success = false;

    try {

      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({
          secret: this.config.get<string>('RECAPTCHA_SECRET_KEY')!,
          response: token,
        }),
      });

      success = ((await res.json()) as { success?: boolean }).success === true;
    } catch (err) {

      this.logger.warn(`No se pudo validar reCAPTCHA: ${(err as Error).message}`);
    }

    if (!success) {

      throw authError(HttpStatus.BAD_REQUEST, 'CAPTCHA_FAILED', 'No pudimos validar el reCAPTCHA.');
    }
  }
}
