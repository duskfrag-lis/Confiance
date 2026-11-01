import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ForceMajeureReviewDto } from './dto/cancellations.dto';
import { ForceMajeureService } from './force-majeure.service';

/** HU-59: el administrador (users.is_admin, D-11) evalúa las cancelaciones por fuerza mayor. */
@ApiTags('admin')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/force-majeure')
export class AdminForceMajeureController {

  constructor(private forceMajeure: ForceMajeureService) {}

  @ApiOperation({ summary: 'HU-59.1 Cancelaciones por fuerza mayor pendientes, con su motivo y evidencia' })
  @Get()
  pending() {

    return this.forceMajeure.pending();
  }

  @ApiOperation({ summary: 'HU-59.2 Marcarla como aprobada o rechazada (por id de la contratación); avisa a quien canceló' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/review')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ForceMajeureReviewDto) {

    return this.forceMajeure.review(user.userId, BigInt(id), dto);
  }
}
