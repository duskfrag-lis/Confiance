import { BadRequestException, CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { apiError } from '../common/errors';

// Mensajes de multer (Nest les agrega " - <campo>"): sobran archivos o llegan en un campo que no es el esperado
const FILE_COUNT_ERROR = /^(Too many files|Unexpected (file )?field)/;

/**
 * Traduce los errores de multer, que salen en inglés y sin `code`, a los códigos de la API. Va antes del
 * FileInterceptor en `@UseInterceptors` para envolverlo: `@UseInterceptors(new UploadErrorsInterceptor(...), FileInterceptor(...))`.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {

  /** `countCode` y `countMessage` son la respuesta cuando sobran archivos. */
  constructor(
    private countCode: string,
    private countMessage: string,
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler) {

    return next.handle().pipe(
      catchError((err: unknown) => {

        if (err instanceof PayloadTooLargeException) {

          return throwError(() => apiError(HttpStatus.BAD_REQUEST, 'IMAGE_TOO_LARGE', 'La foto puede pesar máximo 5 MB.'));
        }

        const message = err instanceof BadRequestException ? (err.getResponse() as { message?: unknown }).message : undefined;

        if (typeof message === 'string' && FILE_COUNT_ERROR.test(message)) {

          return throwError(() => apiError(HttpStatus.BAD_REQUEST, this.countCode, this.countMessage));
        }

        return throwError(() => err);
      }),
    );
  }
}
