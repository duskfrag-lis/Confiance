import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ClaimsService } from './claims.service';
import { AdminClaimsQuery, ClaimStatusDto } from './dto/claims.dto';

/** HU-57: el administrador (users.is_admin, D-11) revisa y resuelve los reclamos. */
@ApiTags('admin')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/claims')
export class AdminClaimsController {

  constructor(private claims: ClaimsService) {}

  @ApiOperation({ summary: 'HU-57.1 Reclamos, con filtro opcional por estado y por fecha de creación (desde/hasta, AAAA-MM-DD)' })
  @Get()
  list(@Query() query: AdminClaimsQuery) {

    return this.claims.adminList(query);
  }

  @ApiOperation({ summary: 'HU-57.2 Detalle: contratación, partes, motivo, descripción, fotos e historial' })
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {

    return this.claims.adminDetail(BigInt(id));
  }

  @ApiOperation({ summary: 'HU-57.3 a HU-57.5 Cambiar el estado con la resolución aplicada (obligatoria); avisa a las dos partes' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/status')
  changeStatus(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ClaimStatusDto) {

    return this.claims.changeStatus(user.userId, BigInt(id), dto);
  }
}
