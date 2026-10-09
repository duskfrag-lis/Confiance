import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {

  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'Catálogo de oficios o categorías (lo usa el registro de prestador)' })
  @Get()
  async findAll() {

    const categories = await this.prisma.categories.findMany({ orderBy: { category_name: 'asc' } });

    return categories.map((c) => ({
      id: String(c.category_id),
      name: c.category_name,
      parentId: c.parent_category_id === null ? null : String(c.parent_category_id),
    }));
  }
}
