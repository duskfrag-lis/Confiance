import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ConfirmTransferDto, StartPseDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';
import { PseService } from './pse.service';

/** HU-43 (PSE con Wompi), HU-44 (transferencia directa) y HU-45 (consulta de pagos). */
@ApiTags('payments')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PaymentsController {

  constructor(
    private payments: PaymentsService,
    private pse: PseService,
  ) {}

  @ApiOperation({ summary: 'HU-45 Pagos de mis contrataciones desde FINALIZADO (cliente o prestador)' })
  @Get('payments/mine')
  mine(@CurrentUser() user: AuthUser) {

    return this.payments.mine(user.userId);
  }

  @ApiOperation({ summary: 'HU-44 Marcar la transferencia como hecha (cliente, en FINALIZADO); el prestador debe confirmarla' })
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  @Post('contracts/:id/payments/transfer')
  markTransfer(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.payments.markTransfer(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-44 Confirmar si llegó la transferencia (prestador); si llegó, queda PAGADO' })
  @Roles('provider')
  @HttpCode(HttpStatus.OK)
  @Post('contracts/:id/payments/transfer/confirm')
  confirmTransfer(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmTransferDto) {

    return this.payments.confirmTransfer(user.userId, BigInt(id), dto.recibida);
  }

  @ApiOperation({ summary: 'HU-43 Bancos de PSE para elegir al pagar' })
  @Roles('client')
  @Get('payments/pse/banks')
  banks() {

    return this.pse.banks();
  }

  @ApiOperation({ summary: 'HU-43 Enlaces a los términos y la autorización de datos de Wompi que el cliente acepta' })
  @Roles('client')
  @Get('payments/pse/terms')
  terms() {

    return this.pse.terms();
  }

  @ApiOperation({ summary: 'HU-43 Pagar por PSE (cliente, en FINALIZADO): crea la transacción en Wompi y devuelve la URL del banco' })
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  @Post('contracts/:id/payments/pse')
  startPse(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StartPseDto) {

    return this.pse.start(user.userId, BigInt(id), dto);
  }

  @ApiOperation({ summary: 'HU-43 Consultar en Wompi el PSE abierto (al volver del banco); devuelve pagado, rechazado o pendiente' })
  @HttpCode(HttpStatus.OK)
  @Post('contracts/:id/payments/pse/sync')
  syncPse(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.pse.sync(user.userId, BigInt(id));
  }
}
