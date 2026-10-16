import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength,
  ValidateIf,
} from 'class-validator';
import { normalizeNit } from '../../dto/auth.dto';
import type { AccountRole } from '../social-identity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '') : value;

/**
 * HU-67 / RF-003A: datos que faltan para crear la cuenta tras Google o Microsoft.
 * Mismas reglas que RegisterClientDto/RegisterProviderDto (dto/auth.dto.ts), sin correo,
 * contraseña ni captcha: el correo lo da el proveedor.
 */
export class CompleteSocialDto {

  @ApiProperty({ enum: ['cliente', 'prestador'] })
  @IsIn(['cliente', 'prestador'], { message: 'Elige si te registras como cliente o como prestador.' })
  rol: AccountRole;

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

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Debes aceptar los términos y la política de tratamiento de datos.' })
  aceptaTerminos: true;

  /** Solo para prestador: IDs de categorías, entre 1 y 3 */
  @ApiPropertyOptional({ example: ['3'] })
  @ValidateIf((dto: CompleteSocialDto) => dto.rol === 'prestador')
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

  /** Si no llega, se usa lo elegido en el login antes de salir al proveedor */
  @ApiPropertyOptional({ description: 'Mantener la sesión al cerrar el navegador' })
  @IsOptional()
  @IsBoolean()
  recordar?: boolean;
}