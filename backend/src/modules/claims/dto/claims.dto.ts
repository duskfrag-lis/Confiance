import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  CLAIM_DESCRIPTION_MAX_LENGTH, CLAIM_RESOLUTION_MAX_LENGTH, CLAIM_STATES, REASON_KEYS, type ClaimReason, type ClaimState,
} from '../claims.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** HU-54: llega como multipart junto con las fotos opcionales (campo `fotos`). */
export class CreateClaimDto {

  @ApiProperty({ enum: REASON_KEYS })
  @IsIn(REASON_KEYS, { message: 'Elige un motivo de la lista.' })
  motivo: ClaimReason;

  @ApiProperty({ maxLength: CLAIM_DESCRIPTION_MAX_LENGTH, example: 'El tubo siguió goteando después de la reparación.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Describe el problema.' })
  @IsString({ message: 'La descripción debe ser texto.' })
  @MaxLength(CLAIM_DESCRIPTION_MAX_LENGTH, { message: 'La descripción puede tener máximo 1000 caracteres.' })
  descripcion: string;
}

/** HU-57.4: el backend exige la resolución en cada cambio de estado. */
export class ClaimStatusDto {

  @ApiProperty({ enum: CLAIM_STATES })
  @IsIn(CLAIM_STATES, { message: 'Elige un estado de la lista.' })
  estado: ClaimState;

  @ApiProperty({ maxLength: CLAIM_RESOLUTION_MAX_LENGTH, example: 'Se habló con las dos partes; el prestador volverá a revisar el arreglo.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Escribe la resolución aplicada.' })
  @IsString({ message: 'La resolución debe ser texto.' })
  @MaxLength(CLAIM_RESOLUTION_MAX_LENGTH, { message: 'La resolución puede tener máximo 1000 caracteres.' })
  resolucion: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** HU-57.1: filtros del listado por estado y por fecha de creación (días en hora de Colombia). */
export class AdminClaimsQuery {

  @ApiPropertyOptional({ enum: CLAIM_STATES })
  @IsOptional()
  @IsIn(CLAIM_STATES, { message: 'Elige un estado de la lista.' })
  estado?: ClaimState;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DATE, { message: 'La fecha "desde" debe tener el formato AAAA-MM-DD.' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(DATE, { message: 'La fecha "hasta" debe tener el formato AAAA-MM-DD.' })
  hasta?: string;
}
