import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { NeedsController } from './needs.controller';
import { NeedsService } from './needs.service';

/** E3 Publicaciones: servicios del prestador (HU-21 a HU-25), necesidades (HU-26, HU-28) y catálogo general (HU-27). */
@Module({
  controllers: [ListingsController, CatalogController, NeedsController],
  providers: [ListingsService, CatalogService, NeedsService],
})
export class PublicationsModule {}
