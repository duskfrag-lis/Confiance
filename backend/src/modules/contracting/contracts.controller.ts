import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ContractsQueryService } from './contracts-query.service';
import { ContractsService } from './contracts.service';
import { CreateContractDto, MyContractsQuery, RejectContractDto } from './dto/contracting.dto';

/**
 * HU-34 y HU-37 (perfil activo cliente); HU-36 (perfil activo prestador). HU-12 y HU-38: cada parte consulta las
 * suyas; el detalle no depende del perfil activo, sino de qué parte es en esa contratación.
 */
@ApiTags('contracts')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {

  constructor(
    private contracts: ContractsService,
    private query: ContractsQueryService,
  ) {}

  @ApiOperation({ summary: 'HU-12 Mis contrataciones del perfil activo, de la más reciente a la más antigua; filtro opcional por estado' })
  @Get('mine')
  list(@CurrentUser() user: AuthUser, @Query() query: MyContractsQuery) {

    return this.query.list(user, query.estado);
  }

  @ApiOperation({ summary: 'HU-34 Datos para solicitar desde una publicación: rango de precio, zona del cliente y bloques libres del prestador' })
  @Roles('client')
  @Get('new/:listingId')
  prepare(@CurrentUser() user: AuthUser, @Param('listingId', ParseIntPipe) listingId: number) {

    return this.contracts.prepare(user.userId, BigInt(listingId));
  }

  @ApiOperation({ summary: 'HU-34 Enviar una solicitud desde una publicación activa; queda en SOLICITADO y se avisa al prestador' })
  @Roles('client')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContractDto) {

    return this.contracts.create(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-36 Aceptar una solicitud (SOLICITADO → ACEPTADO); ocupa el bloque del prestador' })
  @Roles('provider')
  @HttpCode(HttpStatus.OK)
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.contracts.accept(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-36 Rechazar una solicitud con motivo opcional (SOLICITADO → RECHAZADO)' })
  @Roles('provider')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectContractDto) {

    return this.contracts.reject(user.userId, BigInt(id), dto);
  }

  @ApiOperation({ summary: 'HU-37 Confirmar la contratación aceptada (ACEPTADO → CONFIRMADO); genera la cita' })
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.contracts.confirm(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-38 Detalle de una contratación propia: datos, etapas, pago, cierre y acciones permitidas' })
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.query.detail(user.userId, BigInt(id));
  }
}
