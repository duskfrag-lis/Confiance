import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { UploadErrorsInterceptor } from './upload-errors.interceptor';

describe('UploadErrorsInterceptor', () => {
  const interceptor = new UploadErrorsInterceptor('EVIDENCE_PHOTOS', 'Adjunta entre 1 y 5 fotos del trabajo.');
  const responseOf = (err: Error) =>
    lastValueFrom(interceptor.intercept({} as never, { handle: () => throwError(() => err) })).then(
      () => null,
      (e: HttpException) => ({ status: e.getStatus(), body: e.getResponse() }),
    );

  it('una foto demasiado grande para multer responde IMAGE_TOO_LARGE en español', async () => {
    await expect(responseOf(new PayloadTooLargeException('File too large'))).resolves.toEqual({
      status: 400,
      body: { code: 'IMAGE_TOO_LARGE', message: 'La foto puede pesar máximo 5 MB.' },
    });
  });

  it.each(['Unexpected file field - fotos', 'Unexpected field - fotos', 'Too many files'])('"%s" responde el código de cantidad', async (message) => {
    await expect(responseOf(new BadRequestException(message))).resolves.toMatchObject({ body: { code: 'EVIDENCE_PHOTOS' } });
  });

  it('deja pasar los demás errores, como los de validación del cuerpo', async () => {
    const validation = new BadRequestException(['La descripción puede tener máximo 300 caracteres.']);

    await expect(responseOf(validation)).resolves.toMatchObject({ body: { message: ['La descripción puede tener máximo 300 caracteres.'] } });
  });
});
