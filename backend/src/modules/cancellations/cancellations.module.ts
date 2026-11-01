import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CancellationsController } from './cancellations.controller';
import { CancellationsService } from './cancellations.service';

/** E11 Cancelaciones y reagendamiento: ordinaria (HU-50), fuerza mayor (HU-51) y reagendamiento (HU-53). HU-52 está en la E5. */
@Module({
  imports: [NotificationsModule],
  controllers: [CancellationsController],
  providers: [CancellationsService],
})
export class CancellationsModule {}
