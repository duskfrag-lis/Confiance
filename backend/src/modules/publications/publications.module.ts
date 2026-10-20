import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { InterestsService } from './interests.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { NeedsController } from './needs.controller';
import { NeedsService } from './needs.service';

/** E3 Publicaciones: servicios (HU-21 a HU-25), catálogo (HU-27), necesidades (HU-26, HU-28) e intereses (HU-29, HU-30). */
@Module({
  imports: [NotificationsModule],
  controllers: [ListingsController, CatalogController, NeedsController],
  providers: [ListingsService, CatalogService, NeedsService, InterestsService],
})
export class PublicationsModule {}
