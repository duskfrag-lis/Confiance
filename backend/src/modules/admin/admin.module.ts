import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** E14 Administración: resumen del panel. Reclamos (HU-57), verificaciones (HU-58) y fuerza mayor (HU-59) están en sus módulos. */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
