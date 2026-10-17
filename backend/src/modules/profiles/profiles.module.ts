import { Module } from '@nestjs/common';
import { CatalogsController } from './catalogs.controller';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/** E2 Perfiles de usuario (HU-11 a HU-20). */
@Module({
  controllers: [ProfilesController, CatalogsController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
