import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EXECUTION_CRON } from './execution.constants';
import { ExecutionService } from './execution.service';

/** HU-46.3 (recordatorio de inicio) y HU-47.3 (confirmación automática a las 24 h), cada 5 minutos. */
@Injectable()
export class ExecutionScheduler {

  private readonly logger = new Logger(ExecutionScheduler.name);

  constructor(private execution: ExecutionService) {}

  @Cron(EXECUTION_CRON)
  async run() {

    // Cada tarea por separado: si una falla, la otra corre igual y se reintenta en la siguiente vuelta
    try {

      const confirmed = await this.execution.autoConfirm();
      if (confirmed) this.logger.log(`Confirmación automática: ${confirmed} contratación(es).`);
    } catch (err) {

      this.logger.error('Falló la confirmación automática de la finalización', err instanceof Error ? err.stack : String(err));
    }

    try {

      const reminded = await this.execution.remindStart();
      if (reminded) this.logger.log(`Recordatorio de inicio: ${reminded} prestador(es).`);
    } catch (err) {

      this.logger.error('Falló el recordatorio de inicio del servicio', err instanceof Error ? err.stack : String(err));
    }
  }
}
