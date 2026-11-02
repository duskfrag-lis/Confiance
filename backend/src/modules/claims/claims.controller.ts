import { Body, Controller, Get, Param, ParseIntPipe, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import { MAX_CLAIM_PHOTOS, REASON_KEYS } from './claims.constants';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/claims.dto';

type UploadedPhoto = { buffer: Buffer; size: number };

/** HU-54: las dos partes presentan reclamos y los siguen; solo ellas y el administrador los ven (HU-54.4). */
@ApiTags('claims')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ClaimsController {

  constructor(private claims: ClaimsService) {}

  @ApiOperation({ summary: 'HU-54 Presentar un reclamo contra la otra parte (FINALIZADO o COMPLETADO), con hasta 5 fotos en `fotos`' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['motivo', 'descripcion'],
      properties: {
        motivo: { type: 'string', enum: REASON_KEYS },
        descripcion: { type: 'string' },
        fotos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('CLAIM_PHOTOS', 'Puedes adjuntar máximo 5 fotos.'),
    FilesInterceptor('fotos', MAX_CLAIM_PHOTOS, { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @Post('contracts/:id/claims')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClaimDto,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ) {

    return this.claims.create(user.userId, BigInt(id), dto, files);
  }

  @ApiOperation({ summary: 'HU-54.4 Mis reclamos (presentados y en mi contra) del perfil activo' })
  @Get('claims/mine')
  mine(@CurrentUser() user: AuthUser) {

    return this.claims.mine(user);
  }

  @ApiOperation({ summary: 'HU-54.4 Detalle de un reclamo en el que soy parte, con su historial' })
  @Get('claims/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.claims.detail(user.userId, BigInt(id));
  }
}
