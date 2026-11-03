import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RATING_COMMENT_MAX_LENGTH } from '../reputation.constants';

// Un comentario vacío o solo con espacios se guarda como "sin comentario"
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/** HU-49: de 1 a 5 estrellas (obligatoria) y comentario opcional. */
export class RateDto {

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt({ message: 'La calificación debe ser un número entero de 1 a 5.' })
  @Min(1, { message: 'La calificación debe ser de 1 a 5 estrellas.' })
  @Max(5, { message: 'La calificación debe ser de 1 a 5 estrellas.' })
  puntaje: number;

  @ApiPropertyOptional({ maxLength: RATING_COMMENT_MAX_LENGTH, nullable: true, example: 'Puntual y muy ordenado.' })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString({ message: 'El comentario debe ser texto.' })
  @MaxLength(RATING_COMMENT_MAX_LENGTH, { message: 'El comentario puede tener máximo 300 caracteres.' })
  comentario?: string | null;
}
