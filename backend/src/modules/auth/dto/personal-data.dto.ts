import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, Matches } from 'class-validator';
import { CompleteSocialDto } from '../social/dto/complete-social.dto';

/**
 * Mismas reglas que al completar el registro con Google o Microsoft. `oficios` es obligatorio si la
 * cuenta tiene perfil de prestador (lo comprueba AuthService.confirmPersonalData).
 */
export class PersonalDataDto extends PickType(CompleteSocialDto, ['nombres', 'apellidos', 'cedula', 'telefono', 'nit'] as const) {

  @ApiPropertyOptional({ example: ['3'] })
  @IsOptional()
  @IsArray({ message: 'Elige al menos un oficio.' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 oficios.' })
  @ArrayUnique({ message: 'No repitas oficios.' })
  @Matches(/^\d+$/, { each: true, message: 'Oficio inválido.' })
  oficios?: string[];
}
