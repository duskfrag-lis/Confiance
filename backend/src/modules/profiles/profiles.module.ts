import { Module } from '@nestjs/common';
import { BankAccountService } from './bank-account.service';
import { CatalogsController } from './catalogs.controller';
import { EvidenceService } from './evidence.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { PublicProfileController } from './public-profile.controller';
import { PublicProfileService } from './public-profile.service';

/** E2 Perfiles de usuario (HU-11, HU-13 a HU-20). HU-12 queda para la E5 (contrataciones). */
@Module({
  controllers: [ProfilesController, CatalogsController, PublicProfileController],
  providers: [ProfilesService, BankAccountService, EvidenceService, PublicProfileService],
})
export class ProfilesModule {}
