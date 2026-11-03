import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PSE_SYNC_CRON } from './payments.constants';
import { PseService } from './pse.service';

/** HU-43: resuelve los PSE abiertos cuyo evento de Wompi no llegó (en local nunca llega), cada 5 minutos. */
@Injectable()
export class PaymentsScheduler {

  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(private pse: PseService) {}

  @Cron(PSE_SYNC_CRON)
  async run() {

    try {

      const changed = await this.pse.syncPending();
      if (changed) this.logger.log(`PSE resueltos en el barrido: ${changed}.`);
    } catch (err) {

      this.logger.error('Falló el barrido de pagos PSE', err instanceof Error ? err.stack : String(err));
    }
  }
}
