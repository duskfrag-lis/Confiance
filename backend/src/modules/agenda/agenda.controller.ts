import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AgendaService } from './agenda.service';
import { MyAppointmentsQuery } from './dto/agenda.dto';

/** HU-41: citas del perfil activo (cliente o prestador). */
@ApiTags('appointments')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AgendaController {

  constructor(private agenda: AgendaService) {}

  @ApiOperation({ summary: 'HU-41 Mis citas ordenadas por fecha; filtro opcional por estado (proxima, en_curso, completada, cancelada)' })
  @Get('mine')
  list(@CurrentUser() user: AuthUser, @Query() query: MyAppointmentsQuery) {

    return this.agenda.list(user, query.estado);
  }
}
