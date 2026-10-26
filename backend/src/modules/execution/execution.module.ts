import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExecutionController } from './execution.controller';
import { ExecutionScheduler } from './execution.scheduler';
import { ExecutionService } from './execution.service';

/** E9 Ejecución: inicio (HU-46), finalización y su confirmación (HU-47) y reporte de problemas (HU-48). */
@Module({
  imports: [NotificationsModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionScheduler],
})
export class ExecutionModule {}
