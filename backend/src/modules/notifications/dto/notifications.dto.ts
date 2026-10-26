import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** HU-62.3: marcar una notificación como leída (por defecto) o como no leída. */
export class MarkReadDto {

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'leida debe ser true o false.' })
  leida?: boolean;
}
