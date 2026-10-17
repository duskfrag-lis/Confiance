import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength,
  ValidateNested,
} from 'class-validator';
import { BLOCK_KEYS, DAY_KEYS, type BlockKey, type DayKey } from '../profiles.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

/** HU-11. El correo y la cédula no se editan. */
export class UpdateClientProfileDto {

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

  @ApiProperty({ example: '3001234567' })
  @Transform(digitsOnly)
  @Matches(/^3\d{9}$/, { message: 'Ingresa un número de celular válido (10 dígitos).' })
  celular: string;

  @ApiPropertyOptional({ description: 'Barrio de referencia (id del catálogo de zonas)', example: '4', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d+$/, { message: 'Barrio inválido.' })
  barrioId?: string | null;

  @ApiPropertyOptional({ example: 'Calle 10 # 20-30', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(255, { message: 'La dirección puede tener máximo 255 caracteres.' })
  direccion?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200, { message: 'La descripción puede tener máximo 200 caracteres.' })
  descripcion?: string | null;
}

/** HU-15 */
export class ProviderDescriptionDto {

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe tu descripción profesional.' })
  @MaxLength(500, { message: 'La descripción puede tener máximo 500 caracteres.' })
  descripcion: string;
}

/** HU-14 */
export class ProviderTradesDto {

  @ApiProperty({ example: ['3', '7'] })
  @IsArray({ message: 'Elige al menos un oficio.' })
  @ArrayMinSize(1, { message: 'Elige al menos un oficio.' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 oficios.' })
  @ArrayUnique({ message: 'No repitas oficios.' })
  @Matches(/^\d+$/, { each: true, message: 'Oficio inválido.' })
  oficios: string[];
}

/** HU-16: barrios sueltos y/o comunas completas (todos sus barrios activos). */
export class ProviderZonesDto {

  @ApiPropertyOptional({ example: ['4', '5'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^\d+$/, { each: true, message: 'Barrio inválido.' })
  barrios?: string[];

  @ApiPropertyOptional({ description: 'Marca todos los barrios de la comuna', example: ['2'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^\d+$/, { each: true, message: 'Comuna inválida.' })
  comunas?: string[];
}

export class AvailabilitySlotDto {

  @ApiProperty({ enum: DAY_KEYS })
  @IsIn(DAY_KEYS, { message: 'Día inválido.' })
  dia: DayKey;

  @ApiProperty({ enum: BLOCK_KEYS })
  @IsIn(BLOCK_KEYS, { message: 'Bloque inválido: usa mañana, tarde o noche.' })
  bloque: BlockKey;
}

/** HU-17: reemplaza toda la disponibilidad semanal. */
export class ProviderAvailabilityDto {

  @ApiProperty({ type: [AvailabilitySlotDto] })
  @IsArray()
  @ArrayMaxSize(DAY_KEYS.length * BLOCK_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  franjas: AvailabilitySlotDto[];
}
