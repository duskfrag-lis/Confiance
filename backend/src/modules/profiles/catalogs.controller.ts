import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { BLOCK_KEYS, BLOCKS, DAY_KEYS } from './profiles.constants';

const BLOCK_LABELS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as const;
const DAY_LABELS = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
} as const;

const hhmm = (time: Date) => time.toISOString().slice(11, 16);

@ApiTags('catalogs')
@Controller('catalogs')
export class CatalogsController {

  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'HU-11 / HU-16 Zonas activas: comuna → barrios' })
  @Get('zones')
  async zones() {

    const communes = await this.prisma.communes.findMany({
      where: { is_active: true },
      orderBy: { commune_name: 'asc' },
      select: {
        commune_id: true,
        commune_name: true,
        neighborhoods: {
          where: { is_active: true },
          orderBy: { neighborhood_name: 'asc' },
          select: { neighborhood_id: true, neighborhood_name: true },
        },
      },
    });

    return communes.map((c) => ({
      id: String(c.commune_id),
      nombre: c.commune_name,
      barrios: c.neighborhoods.map((n) => ({ id: String(n.neighborhood_id), nombre: n.neighborhood_name })),
    }));
  }

  @ApiOperation({ summary: 'HU-17 Días y bloques de la disponibilidad (hora de Colombia)' })
  @Get('availability')
  async availability() {

    const blocks = await this.prisma.time_blocks.findMany();
    const byName = new Map(blocks.map((b) => [b.block_name, b]));

    return {
      dias: DAY_KEYS.map((id) => ({ id, nombre: DAY_LABELS[id] })),
      bloques: BLOCK_KEYS.map((id) => {
        const block = byName.get(BLOCKS[id])!;
        return { id, nombre: BLOCK_LABELS[id], inicio: hhmm(block.start_time), fin: hhmm(block.end_time) };
      }),
    };
  }
}
