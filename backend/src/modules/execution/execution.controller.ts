import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ReportIssueDto } from './dto/execution.dto';
import { ExecutionService } from './execution.service';

/** HU-46 y HU-47 (inicio y finalización por el prestador, confirmación del cliente) y HU-48 (cualquiera de las partes). */
@ApiTags('contracts')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ExecutionController {

  constructor(private execution: ExecutionService) {}

  @ApiOperation({ summary: 'HU-46 Marcar el inicio del servicio (CONFIRMADO → EN_CURSO); avisa al cliente' })
  @Roles('provider')
  @HttpCode(HttpStatus.OK)
  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.execution.start(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-47 Marcar el servicio como finalizado (EN_CURSO → FINALIZADO); empieza el plazo de 24 h del cliente' })
  @Roles('provider')
  @HttpCode(HttpStatus.OK)
  @Post(':id/finish')
  finish(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.execution.finish(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-47 Confirmar la finalización (cliente, en FINALIZADO); con el pago hecho pasa a COMPLETADO' })
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  @Post(':id/confirm-completion')
  confirmCompletion(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.execution.confirmCompletion(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-48 Reportar un problema (cualquiera de las partes, en FINALIZADO o COMPLETADO)' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/report')
  report(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReportIssueDto) {

    return this.execution.report(user.userId, BigInt(id), dto);
  }
}
