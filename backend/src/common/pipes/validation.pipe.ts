import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

/**
 * Un mensaje por campo. class-validator evalúa los decoradores de abajo hacia arriba y devuelve todos los que
 * fallan: un campo vacío mostraba "Escribe la dirección exacta." dos veces y además "máximo 255 caracteres".
 * `stopAtFirstError` tampoco sirve, porque se quedaría con el de más abajo (el límite de longitud). Aquí se toma
 * el del decorador escrito más arriba que falló, que es el que describe mejor el problema (obligatorio, formato).
 */
export function firstMessages(errors: ValidationError[]): string[] {

  return errors.flatMap((error) => {

    const messages = Object.values(error.constraints ?? {});
    const own = messages.length ? [messages[messages.length - 1]] : [];

    return [...own, ...firstMessages(error.children ?? [])];
  });
}

export const appValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(firstMessages(errors)),
  });
