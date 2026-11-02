import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '') : value;

/**
 * NIT: número base y dígito de verificación. Una empresa tiene 9 dígitos (900123456-8); una persona natural usa su
 * cédula, de 6 a 10 dígitos. El NIT es opcional (D-09).
 */
export const NIT_REGEX = /^\d{6,10}-\d$/;
export const NIT_MESSAGE = 'Ingresa el NIT con su dígito de verificación (ej. 900123456-8).';
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de la DIAN, el mismo para empresas y personas naturales. */
export const nitCheckDigit = (base: string) => {

  const sum = [...base].reverse().reduce((acc, d, i) => acc + Number(d) * NIT_WEIGHTS[i], 0);
  const r = sum % 11;

  return r > 1 ? 11 - r : r;
};

export const normalizeNit = ({ value }: { value: unknown }) => {

  if (typeof value !== 'string') return value;

  const nit = value.replace(/\s/g, '');

  if (!nit) return null;

  // El último dígito siempre es el de verificación; lo que no tenga forma de NIT lo rechaza NIT_REGEX
  return /^\d{6,10}-?\d$/.test(nit) ? `${nit.replace('-', '').slice(0, -1)}-${nit.slice(-1)}` : nit;
};

/** El dígito de verificación debe coincidir con el que calcula la DIAN. */
export const IsNitCheckDigit = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isNitCheckDigit',
      validator: {
        validate: (value: unknown) => {

          if (typeof value !== 'string' || !NIT_REGEX.test(value)) return true; // vacío o mal formado: lo responden @IsOptional y @Matches
          const [base, dv] = value.split('-');
          return nitCheckDigit(base) === Number(dv);
        },
      },
    },
    options,
  );

export const NIT_CHECK_MESSAGE = 'El dígito de verificación no coincide. Revisa el NIT en tu RUT.';

export class EmailDto {

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(150)
  email: string;
}

export class CaptchaDto {

  @ApiProperty({ description: 'Token devuelto por el widget de reCAPTCHA' })
  @IsString()
  @IsNotEmpty({ message: 'Completa la verificación reCAPTCHA.' })
  captchaToken: string;
}

/** HU-01 — campos de RegisterClientPayload del frontend */
export class RegisterClientDto {

  @ApiProperty({ example: 'Laura Marcela' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tus nombres.' })
  @MaxLength(50, { message: 'Los nombres pueden tener máximo 50 caracteres.' })
  nombres: string;

  @ApiProperty({ example: 'Gómez Ríos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tus apellidos.' })
  @MaxLength(50, { message: 'Los apellidos pueden tener máximo 50 caracteres.' })
  apellidos: string;

  @ApiProperty({ example: '1020304050' })
  @Transform(digitsOnly)
  @Matches(/^\d{6,10}$/, { message: 'La cédula debe tener entre 6 y 10 dígitos.' })
  cedula: string;

  @ApiProperty({ example: '3001234567' })
  @Transform(digitsOnly)
  @Matches(/^3\d{9}$/, { message: 'Ingresa un número de celular válido (10 dígitos).' })
  telefono: string;

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Prueba123!' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Debes aceptar los términos y la política de tratamiento de datos.' })
  aceptaTerminos: true;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Completa la verificación reCAPTCHA.' })
  captchaToken: string;
}

/** HU-02 */
export class RegisterProviderDto extends RegisterClientDto {

  @ApiProperty({ description: 'IDs de categorías (GET /categories), entre 1 y 3', example: ['3'] })
  @IsArray({ message: 'Elige al menos un oficio.' })
  @ArrayMinSize(1, { message: 'Elige al menos un oficio.' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 oficios.' })
  @ArrayUnique({ message: 'No repitas oficios.' })
  @Matches(/^\d+$/, { each: true, message: 'Oficio inválido.' })
  oficios: string[];

  @ApiPropertyOptional({ example: '900123456-8', nullable: true })
  @IsOptional()
  @Transform(normalizeNit)
  @Matches(NIT_REGEX, { message: NIT_MESSAGE })
  @IsNitCheckDigit({ message: NIT_CHECK_MESSAGE })
  nit?: string | null;
}

/** HU-03 */
export class LoginDto extends CaptchaDto {

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu contraseña.' })
  @MaxLength(100)
  password: string;

  @ApiPropertyOptional({ description: 'Mantener la sesión al cerrar el navegador', default: false })
  @IsOptional()
  @IsBoolean()
  recordar?: boolean;
}

/** HU-04 — solicitud */
export class ForgotPasswordDto extends CaptchaDto {

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email: string;
}

/** HU-04 — restablecimiento */
export class ResetPasswordDto {

  @ApiProperty({ description: 'Token recibido en el enlace del correo' })
  @IsString()
  @IsNotEmpty({ message: 'El enlace no es válido.' })
  @MaxLength(100)
  token: string;

  @ApiProperty({ example: 'Nueva123!' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
}

/** HU-08 — cambio de perfil. Oficios y NIT solo se usan al activar el perfil de prestador por primera vez. */
export class SwitchProfileDto {

  @ApiProperty({ enum: ['client', 'provider'] })
  @IsIn(['client', 'provider'], { message: 'Perfil inválido.' })
  perfil: 'client' | 'provider';

  @ApiPropertyOptional({ description: 'IDs de oficios, entre 1 y 3', example: ['3'] })
  @IsOptional()
  @IsArray({ message: 'Elige al menos un oficio.' })
  @ArrayMinSize(1, { message: 'Elige al menos un oficio.' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 oficios.' })
  @ArrayUnique({ message: 'No repitas oficios.' })
  @Matches(/^\d+$/, { each: true, message: 'Oficio inválido.' })
  oficios?: string[];

  @ApiPropertyOptional({ example: '900123456-8', nullable: true })
  @IsOptional()
  @Transform(normalizeNit)
  @Matches(NIT_REGEX, { message: NIT_MESSAGE })
  @IsNitCheckDigit({ message: NIT_CHECK_MESSAGE })
  nit?: string | null;
}
