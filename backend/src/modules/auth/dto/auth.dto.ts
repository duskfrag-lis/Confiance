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
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '') : value;

/** "9001234567" → "900123456-7": un solo formato para que el UNIQUE de nit funcione (D-09). Vacío → null. */
export const normalizeNit = ({ value }: { value: unknown }) => {

  if (typeof value !== 'string') return value;

  const nit = value.replace(/\s/g, '');

  if (!nit) return null;

  return /^\d{10}$/.test(nit) ? `${nit.slice(0, 9)}-${nit.slice(9)}` : nit;
};

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

  @ApiPropertyOptional({ example: '900123456-7', nullable: true })
  @IsOptional()
  @Transform(normalizeNit)
  @Matches(/^\d{9}-\d$/, { message: 'Ingresa un NIT válido (ej. 900123456-7).' })
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

  @ApiPropertyOptional({ example: '900123456-7', nullable: true })
  @IsOptional()
  @Transform(normalizeNit)
  @Matches(/^\d{9}-\d$/, { message: 'Ingresa un NIT válido (ej. 900123456-7).' })
  nit?: string | null;
}
