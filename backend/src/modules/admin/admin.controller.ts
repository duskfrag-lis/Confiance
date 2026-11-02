import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

/** E14: rutas generales del panel. Cada sección (reclamos, verificaciones, fuerza mayor) vive en su módulo. */
@ApiTags('admin')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {

  constructor(private admin: AdminService) {}

  @ApiOperation({ summary: 'E14 Resumen: reclamos activos, verificaciones y fuerzas mayores pendientes' })
  @Get('summary')
  summary() {

    return this.admin.summary();
  }
}
