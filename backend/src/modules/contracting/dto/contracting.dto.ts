import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_PRICE } from '../../publications/publications.constants';
import { REQUEST_STATES, type RequestState } from '../contracting.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value;

/**
 * HU-34: todos los campos son obligatorios. Que la fecha sea futura y caiga en un bloque libre del prestador lo
 * revisa el servicio (HU-34.4).
 */
export class CreateContractDto {

  @ApiProperty({ description: 'Publicación activa de origen (HU-34.1, HU-34.2)', example: '12' })
  @Matches(/^\d+$/, { message: 'Elige una publicación.' })
  publicacionId: string;

  @ApiProperty({ description: 'ISO 8601 con zona horaria, dentro de un bloque libre del prestador', example: '2026-10-27T09:00:00-05:00' })
  @IsISO8601({ strict: true }, { message: 'Elige una fecha y hora válidas.' })
  // Con hora y zona explícitas: sin zona, el servidor la leería en su hora local y no en la de Colombia
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, { message: 'Elige una fecha y hora válidas.' })
  fechaHora: string;

  @ApiProperty({ description: 'Barrio del catálogo de zonas (la comuna sale del barrio)', example: '3' })
  @Matches(/^\d+$/, { message: 'Elige un barrio del catálogo.' })
  barrioId: string;

  @ApiProperty({ maxLength: 255, description: 'El prestador la ve desde ACEPTADO (HU-38.2)', example: 'Calle 10 # 5-20' })
  @Transform(trim)
  @IsString({ message: 'Escribe la dirección exacta.' })
  @IsNotEmpty({ message: 'Escribe la dirección exacta.' })
  @MaxLength(255, { message: 'La dirección puede tener máximo 255 caracteres.' })
  direccion: string;

  @ApiProperty({ description: 'Pesos colombianos, mayor que cero (HU-34.5)', example: 80000 })
  @Type(() => Number)
  @IsInt({ message: 'El valor debe ser un valor en pesos, sin decimales.' })
  @Min(1, { message: 'El valor propuesto debe ser mayor que cero.' })
  @Max(MAX_PRICE, { message: 'El valor puede ser de máximo $30.000.000.' })
  valor: number;
}

/** HU-36: el motivo del rechazo es opcional. */
export class RejectContractDto {

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(300, { message: 'El motivo puede tener máximo 300 caracteres.' })
  motivo?: string;
}

/** HU-12.2: filtro opcional por estado. */
export class MyContractsQuery {

  @ApiPropertyOptional({ enum: REQUEST_STATES })
  @IsOptional()
  @IsIn(REQUEST_STATES, { message: 'Estado inválido.' })
  estado?: RequestState;
}
