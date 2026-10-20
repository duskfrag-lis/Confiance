import { Module } from '@nestjs/common';
import { CatalogService } from '../publications/catalog.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** E4 Búsqueda y descubrimiento (HU-31 a HU-33). Las tarjetas salen del catálogo (HU-27). */
@Module({
  controllers: [SearchController],
  providers: [SearchService, CatalogService],
})
export class SearchModule {}
