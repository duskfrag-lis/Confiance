import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { APPOINTMENT_STATE_KEYS, type AppointmentStateKey } from '../agenda.constants';

/** HU-41.2: filtro opcional por estado. */
export class MyAppointmentsQuery {

  @ApiPropertyOptional({ enum: APPOINTMENT_STATE_KEYS })
  @IsOptional()
  @IsIn(APPOINTMENT_STATE_KEYS, { message: 'Estado inválido: usa proxima, en_curso, completada o cancelada.' })
  estado?: AppointmentStateKey;
}
