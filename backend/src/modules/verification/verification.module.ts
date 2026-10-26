import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminVerificationsController } from './admin-verifications.controller';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

/** E13 Verificación de identidad: solicitud (HU-55), insignia (HU-56, en las vistas) y revisión del administrador (HU-58). */
@Module({
  imports: [NotificationsModule],
  controllers: [VerificationController, AdminVerificationsController],
  providers: [VerificationService],
})
export class VerificationModule {}
