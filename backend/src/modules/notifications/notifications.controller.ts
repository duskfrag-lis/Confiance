import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MarkReadDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** HU-62: bandeja de notificaciones del perfil activo. */
@ApiTags('notifications')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {

  constructor(private notifications: NotificationsService) {}

  @ApiOperation({ summary: 'HU-62 Mis notificaciones (perfil activo), de la más reciente a la más antigua, con leída o no' })
  @Get('mine')
  list(@CurrentUser() user: AuthUser) {

    return this.notifications.list(user);
  }

  @ApiOperation({ summary: 'HU-62.3 Marcar todas las notificaciones del perfil activo como leídas' })
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: AuthUser) {

    return this.notifications.readAll(user);
  }

  @ApiOperation({ summary: 'HU-62.3 Marcar una notificación como leída ({ leida: true }, por defecto) o no leída' })
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  setRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MarkReadDto) {

    return this.notifications.setRead(user.userId, BigInt(id), dto.leida ?? true);
  }
}
