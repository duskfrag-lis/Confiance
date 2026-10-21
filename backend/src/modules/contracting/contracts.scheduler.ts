import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AUTO_CANCEL_CRON } from './contracting.constants';
import { ContractsService } from './contracts.service';

/** HU-52 · Cancelación automática por plazo (HU-36.5 y HU-37.5), cada 15 minutos. */
@Injectable()
export class ContractsScheduler {

  private readonly logger = new Logger(ContractsScheduler.name);

  constructor(private contracts: ContractsService) {}

  @Cron(AUTO_CANCEL_CRON)
  async autoCancel() {

    try {

      const count = await this.contracts.autoCancelStale();
      if (count) this.logger.log(`Cancelación automática: ${count} contratación(es) vencida(s).`);
    } catch (err) {

      // Un fallo no debe tumbar el proceso: se reintenta en la siguiente vuelta
      this.logger.error('Falló la cancelación automática de contrataciones', err instanceof Error ? err.stack : String(err));
    }
  }
}
