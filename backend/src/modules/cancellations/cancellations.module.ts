import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminForceMajeureController } from './admin-force-majeure.controller';
import { CancellationsController } from './cancellations.controller';
import { CancellationsService } from './cancellations.service';
import { ForceMajeureService } from './force-majeure.service';

/**
 * E11 Cancelaciones y reagendamiento: ordinaria (HU-50), fuerza mayor (HU-51) y reagendamiento (HU-53),
 * y la evaluación de la fuerza mayor por el administrador (HU-59). HU-52 está en la E5.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CancellationsController, AdminForceMajeureController],
  providers: [CancellationsService, ForceMajeureService],
})
export class CancellationsModule {}
