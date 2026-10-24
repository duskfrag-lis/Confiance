import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ReviewVerificationDto } from './dto/verification.dto';
import { VerificationService } from './verification.service';

/** HU-58: el administrador (users.is_admin, D-11) revisa la documentación de identidad. */
@ApiTags('admin')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/verifications')
export class AdminVerificationsController {

  constructor(private verification: VerificationService) {}

  @ApiOperation({ summary: 'HU-58.1 Solicitudes pendientes, de la más antigua a la más reciente' })
  @Get()
  pending() {

    return this.verification.pending();
  }

  @ApiOperation({ summary: 'HU-58.2 Aprobar, rechazar o pedir corrección (motivo obligatorio salvo al aprobar); avisa al prestador' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/review')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReviewVerificationDto) {

    return this.verification.review(user.userId, BigInt(id), dto);
  }
}
