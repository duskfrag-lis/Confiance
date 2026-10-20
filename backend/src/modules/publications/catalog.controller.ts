import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CatalogQuery } from './dto/publications.dto';

/** HU-27: se consulta sin iniciar sesión (D-46). */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {

  constructor(private catalog: CatalogService) {}

  @ApiOperation({ summary: 'HU-27 Catálogo de servicios activos, paginado; `categoriaId` filtra por categoría u oficio' })
  @Get('listings')
  list(@Query() query: CatalogQuery) {

    return this.catalog.list(query);
  }

  @ApiOperation({ summary: 'HU-27 Detalle público de una publicación activa' })
  @Get('listings/:id')
  get(@Param('id', ParseIntPipe) id: number) {

    return this.catalog.get(BigInt(id));
  }
}
