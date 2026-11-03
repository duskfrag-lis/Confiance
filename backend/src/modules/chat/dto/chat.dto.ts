import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MESSAGE_MAX_LENGTH } from '../chat.constants';

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
