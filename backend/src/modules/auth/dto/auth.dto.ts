import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEmail,
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
  @IsNotEmpty()
  captchaToken: string;
}

/** HU-01 — campos de RegisterClientPayload del frontend */
export class RegisterClientDto {

  @ApiProperty({ example: 'Laura Marcela' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombres: string;

  @ApiProperty({ example: 'Gómez Ríos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
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
  @IsNotEmpty()
  captchaToken: string;
}

/** HU-02 */
export class RegisterProviderDto extends RegisterClientDto {

  @ApiProperty({ description: 'IDs de categorías (GET /categories), entre 1 y 3', example: ['3'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un oficio.' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 oficios.' })
  @ArrayUnique()
  @Matches(/^\d+$/, { each: true, message: 'Oficio inválido.' })
  oficios: string[];

  @ApiPropertyOptional({ example: '900123456-7', nullable: true })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{9}-?\d$/, { message: 'Ingresa un NIT válido (ej. 900123456-7).' })
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
  @IsNotEmpty()
  @MaxLength(100)
  password: string;
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
  @IsNotEmpty()
  @MaxLength(100)
  token: string;

  @ApiProperty({ example: 'Nueva123!' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
}
