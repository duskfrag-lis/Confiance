import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminClaimsController } from './admin-claims.controller';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

/** E12 Reclamos: creación por las partes (HU-54) y gestión del administrador (HU-57). */
@Module({
  imports: [NotificationsModule],
  controllers: [ClaimsController, AdminClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
