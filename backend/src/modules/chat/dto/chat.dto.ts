import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** HU-42.3: mensajes de texto de máximo 2000 caracteres. */
export class SendMessageDto {

  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: 'Escribe un mensaje.' })
  @IsNotEmpty({ message: 'Escribe un mensaje.' })
  @MaxLength(2000, { message: 'El mensaje puede tener máximo 2000 caracteres.' })
  texto: string;
}

/** HU-42.4: el historial se pide por páginas, de los más recientes hacia atrás. */
export class MessagesQuery {

  @ApiPropertyOptional({ description: 'Id del mensaje más antiguo que ya se tiene: trae los anteriores a él' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Mensaje inválido.' })
  antes?: string;
}
