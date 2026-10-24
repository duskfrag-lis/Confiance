import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REPORT_MAX_LENGTH } from '../execution.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** HU-48: la descripción del problema es obligatoria. */
export class ReportIssueDto {

  @ApiProperty({ maxLength: REPORT_MAX_LENGTH, example: 'Quedó goteando el tubo después de la reparación.' })
  @Transform(trim)
  @IsString({ message: 'La descripción debe ser texto.' })
  @IsNotEmpty({ message: 'Describe el problema.' })
  @MaxLength(REPORT_MAX_LENGTH, { message: 'La descripción puede tener máximo 1000 caracteres.' })
  descripcion: string;
}
