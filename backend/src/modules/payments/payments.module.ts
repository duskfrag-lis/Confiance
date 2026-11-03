import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsScheduler } from './payments.scheduler';
import { PaymentsService } from './payments.service';
import { PseService } from './pse.service';
import { WompiEventsController } from './wompi-events.controller';
import { WompiClient } from './wompi.client';

/** E9 Pagos desde FINALIZADO: PSE con Wompi (HU-43), transferencia directa (HU-44) y consulta (HU-45). */
@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, WompiEventsController],
  providers: [PaymentsService, PseService, WompiClient, PaymentsScheduler],
})
export class PaymentsModule {}
