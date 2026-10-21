import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractsController } from './contracts.controller';
import { ContractsScheduler } from './contracts.scheduler';
import { ContractsService } from './contracts.service';

/** E5 Contratación: solicitud (HU-34, HU-35), respuesta del prestador (HU-36) y confirmación del cliente (HU-37). */
@Module({
  imports: [NotificationsModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsScheduler],
})
export class ContractingModule {}
