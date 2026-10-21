import { Module } from '@nestjs/common';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

/** E6 Agenda: consulta de citas (HU-41). HU-39 y HU-40 viven en la base (disponibilidad, choques y la cita). */
@Module({
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
