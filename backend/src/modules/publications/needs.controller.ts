import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import { InterestDto, MyNeedsQuery, NeedDto, NeedsBoardQuery, SelectProviderDto } from './dto/publications.dto';
import { InterestsService } from './interests.service';
import { NeedsService } from './needs.service';
import { MAX_NEED_PHOTOS } from './publications.constants';

type UploadedPhoto = { buffer: Buffer; size: number };

/** HU-26 y HU-30 (perfil activo cliente); HU-28 y HU-29 (perfil activo prestador). */
@ApiTags('needs')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('needs')
export class NeedsController {

  constructor(
    private needs: NeedsService,
    private interests: InterestsService,
  ) {}

  @ApiOperation({ summary: 'HU-28 Necesidades abiertas para prestadores, paginadas; filtro por oficio/categoría y por comuna o barrio' })
  @Roles('provider')
  @Get()
  board(@CurrentUser() user: AuthUser, @Query() query: NeedsBoardQuery) {

    return this.needs.board(user.userId, query);
  }

  @ApiOperation({ summary: 'HU-26 Mis necesidades con su estado; filtro opcional por estado' })
  @Roles('client')
  @Get('mine')
  listOwn(@CurrentUser() user: AuthUser, @Query() query: MyNeedsQuery) {

    return this.needs.listOwn(user.userId, query.estado);
  }

  @ApiOperation({ summary: 'HU-26 Una necesidad propia, con la dirección exacta' })
  @Roles('client')
  @Get('mine/:id')
  getOwn(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.needs.getOwn(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-29 Mis intereses con su resultado (y la solicitud creada si me seleccionaron)' })
  @Roles('provider')
  @Get('interests/mine')
  listOwnInterests(@CurrentUser() user: AuthUser) {

    return this.interests.listOwn(user.userId);
  }

  @ApiOperation({ summary: 'HU-30 Interesados en una necesidad propia: perfil, mensaje, precio propuesto y disponibilidad' })
  @Roles('client')
  @Get('mine/:id/interests')
  listInterests(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.interests.listForNeed(user.userId, BigInt(id));
  }

  @ApiOperation({
    summary: 'HU-30 Seleccionar a un interesado: crea la solicitud (SOLICITADO). `valor` solo si el prestador no propuso precio',
  })
  @Roles('client')
  @HttpCode(HttpStatus.CREATED)
  @Post('mine/:id/interests/:interestId/select')
  select(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('interestId', ParseIntPipe) interestId: number,
    @Body() dto: SelectProviderDto,
  ) {

    return this.interests.select(user.userId, BigInt(id), BigInt(interestId), dto);
  }

  @ApiOperation({ summary: 'HU-29 Mostrar interés en una necesidad, con mensaje y precio opcionales (una vez por necesidad)' })
  @Roles('provider')
  @Post(':id/interest')
  createInterest(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: InterestDto) {

    return this.interests.create(user.userId, BigInt(id), dto);
  }

  @ApiOperation({ summary: 'HU-28 Detalle de una necesidad abierta, sin dirección exacta ni datos del cliente' })
  @Roles('provider')
  @Get(':id')
  getForProvider(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.needs.getForProvider(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-26 Publicar una necesidad: campos y hasta 5 fotos opcionales (campo `fotos`); queda abierta' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descripcion: { type: 'string' },
        oficioId: { type: 'string' },
        barrioId: { type: 'string' },
        direccion: { type: 'string' },
        fechaPreferida: { type: 'string', format: 'date-time' },
        presupuestoMin: { type: 'integer' },
        presupuestoMax: { type: 'integer' },
        fotos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @Roles('client')
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('NEED_PHOTOS', 'Puedes adjuntar máximo 5 fotos.'),
    FilesInterceptor('fotos', MAX_NEED_PHOTOS, { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: NeedDto, @UploadedFiles() files: UploadedPhoto[] | undefined) {

    return this.needs.create(user.userId, dto, files);
  }

  @ApiOperation({ summary: 'HU-26.6 Cerrar una necesidad abierta (deja de recibir intereses; sus fotos dejan de verse)' })
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.needs.close(user.userId, BigInt(id));
  }
}
