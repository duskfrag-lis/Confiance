import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractsQueryService } from './contracts-query.service';
import { ContractsController } from './contracts.controller';
import { ContractsScheduler } from './contracts.scheduler';
import { ContractsService } from './contracts.service';

/**
 * E5 Contratación: solicitud (HU-34, HU-35), respuesta del prestador (HU-36), confirmación del cliente (HU-37),
 * consulta (HU-38) e historial del cliente (HU-12).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsQueryService, ContractsScheduler],
})
export class ContractingModule {}
