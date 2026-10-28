import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE, MESSAGE_MAX_LENGTH } from '../chat.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** HU-42: un mensaje de texto, sin adjuntos. */
export class SendMessageDto {

  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH, example: 'Hola, ¿le queda bien a las 9?' })
  @Transform(trim)
  @IsString({ message: 'Escribe un mensaje.' })
  @IsNotEmpty({ message: 'Escribe un mensaje.' })
  @MaxLength(MESSAGE_MAX_LENGTH, { message: 'El mensaje puede tener máximo 2000 caracteres.' })
  texto: string;
}

/** HU-42: el historial se pide hacia atrás; `antesDe` es el id del mensaje más antiguo que ya tienes. */
export class MessagesQuery {

  @ApiPropertyOptional({ description: 'Id del mensaje más antiguo cargado (siguienteCursor)', example: '52' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'El cursor no es válido.' })
  antesDe?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1, { message: 'El límite debe ser al menos 1.' })
  @Max(MAX_PAGE_SIZE, { message: 'El límite puede ser de máximo 50.' })
  limite?: number;
}
