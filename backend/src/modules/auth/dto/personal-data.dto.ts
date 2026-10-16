import { PickType } from '@nestjs/swagger';
import { CompleteSocialDto } from '../social/dto/complete-social.dto';

/** Mismas reglas que al completar el registro con Google o Microsoft. */
export class PersonalDataDto extends PickType(CompleteSocialDto, ['nombres', 'apellidos', 'cedula', 'telefono'] as const) {}
