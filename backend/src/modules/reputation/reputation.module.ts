import { Module } from '@nestjs/common';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

/** E10 Reputación: calificaciones entre las partes (HU-49). */
@Module({
  controllers: [ReputationController],
  providers: [ReputationService],
})
export class ReputationModule {}
