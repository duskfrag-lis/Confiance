import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CANCEL_REASON_MAX_LENGTH } from '../cancellations.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// En multipart todo llega como texto
const toBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

/** HU-50 (ordinaria) y HU-51 (fuerza mayor, con evidencia opcional en el campo `evidencia`). */
export class CancelContractDto {

  @ApiProperty({ maxLength: CANCEL_REASON_MAX_LENGTH, example: 'Me surgió un viaje de trabajo.' })
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe el motivo de la cancelación.' })
  @MaxLength(CANCEL_REASON_MAX_LENGTH, { message: 'El motivo puede tener máximo 500 caracteres.' })
  motivo: string;

  @ApiPropertyOptional({ default: false, description: 'HU-51: cancelación por fuerza mayor (la evalúa el administrador)' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'fuerzaMayor debe ser true o false.' })
  fuerzaMayor?: boolean;
}

/** HU-53: nueva fecha y hora propuesta. */
export class RescheduleDto {

  @ApiProperty({ description: 'ISO 8601 con zona horaria, dentro de la disponibilidad del prestador', example: '2026-10-28T09:00:00-05:00' })
  @IsISO8601({ strict: true }, { message: 'Elige una fecha y hora válidas.' })
  // Con hora y zona explícitas: sin zona, el servidor la leería en su hora local y no en la de Colombia
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, { message: 'Elige una fecha y hora válidas.' })
  fechaHora: string;
}

/** HU-53.3: la otra parte acepta o rechaza la propuesta pendiente. */
export class RespondRescheduleDto {

  @ApiProperty()
  @IsBoolean({ message: 'aceptar debe ser true o false.' })
  aceptar: boolean;
}
