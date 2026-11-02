import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  DECISIONS, DOCUMENT_NUMBER_MAX_LENGTH, REVIEW_REASON_MAX_LENGTH, VERIFICATION_INFO_MAX_LENGTH, type Decision,
} from '../verification.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Un texto opcional vacío o solo con espacios se guarda como "sin texto"
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/** HU-55: llega como multipart junto con las fotos (campo `fotos`). */
export class SubmitVerificationDto {

  @ApiProperty({ example: '1', description: 'Id del catálogo GET /verification/document-types' })
  @Matches(/^\d+$/, { message: 'Elige el tipo de documento.' })
  tipoDocumento: string;

  @ApiProperty({ maxLength: DOCUMENT_NUMBER_MAX_LENGTH, example: '1020304050' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Ingresa el número del documento.' })
  @IsString({ message: 'El número del documento debe ser texto.' })
  @MaxLength(DOCUMENT_NUMBER_MAX_LENGTH, { message: 'El número del documento puede tener máximo 30 caracteres.' })
  numero: string;

  @ApiPropertyOptional({ maxLength: VERIFICATION_INFO_MAX_LENGTH })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString({ message: 'La información adicional debe ser texto.' })
  @MaxLength(VERIFICATION_INFO_MAX_LENGTH, { message: 'La información adicional puede tener máximo 500 caracteres.' })
  informacion?: string | null;
}

/** HU-58.2 y HU-58.3: el motivo es obligatorio para rechazar o pedir una corrección (lo revisa el servicio). */
export class ReviewVerificationDto {

  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS, { message: 'La decisión debe ser aprobada, rechazada o correccion.' })
  decision: Decision;

  @ApiPropertyOptional({ maxLength: REVIEW_REASON_MAX_LENGTH, example: 'La foto del reverso está borrosa.' })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(REVIEW_REASON_MAX_LENGTH, { message: 'El motivo puede tener máximo 500 caracteres.' })
  motivo?: string | null;
}
