import { HttpException, HttpStatus } from '@nestjs/common';

/** Error con código estable que el frontend reconoce (`message.code`), igual que authError. */
export function apiError(status: HttpStatus, code: string, message: string) {

  return new HttpException({ code, message }, status);
}
