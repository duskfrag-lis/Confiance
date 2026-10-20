import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchQuery } from './dto/search.dto';
import { SearchService } from './search.service';

/** HU-31: no requiere sesión (D-46). */
@ApiTags('search')
@Controller('search')
export class SearchController {

  constructor(private searchService: SearchService) {}

  @ApiOperation({
    summary: 'HU-31 a HU-33 Buscar servicios por texto o categoría, con filtros combinables; ordenados por relevancia',
  })
  @Get('listings')
  search(@Query() query: SearchQuery) {

    return this.searchService.search(query);
  }
}
