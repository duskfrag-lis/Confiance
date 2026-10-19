import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

/** E3 Publicaciones: servicios del prestador (HU-21 a HU-25) y catálogo general (HU-27). */
@Module({
  controllers: [ListingsController, CatalogController],
  providers: [ListingsService, CatalogService],
})
export class PublicationsModule {}
