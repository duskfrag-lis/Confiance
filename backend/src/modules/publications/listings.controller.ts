import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UploadedFiles,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import { ListingDto, MyListingsQuery } from './dto/publications.dto';
import { ListingsService } from './listings.service';
import { MAX_LISTING_PHOTOS } from './publications.constants';

type UploadedPhoto = { buffer: Buffer; size: number };

const LISTING_FIELDS = {
  titulo: { type: 'string' },
  oficioId: { type: 'string' },
  descripcion: { type: 'string' },
  precioMin: { type: 'integer' },
  precioMax: { type: 'integer' },
};

/** HU-21 a HU-25: publicaciones del prestador (perfil activo de prestador). */
@ApiTags('listings')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('provider')
@Controller('listings')
export class ListingsController {

  constructor(private listings: ListingsService) {}

  @ApiOperation({ summary: 'HU-25 Mis publicaciones con su estado y las acciones permitidas; filtro opcional por estado' })
  @Get('mine')
  listOwn(@CurrentUser() user: AuthUser, @Query() query: MyListingsQuery) {

    return this.listings.listOwn(user.userId, query.estado);
  }

  @ApiOperation({ summary: 'HU-22 Una publicación propia, con los ids de sus fotos para editarla' })
  @Get('mine/:id')
  getOwn(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.listings.getOwn(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-21 Publicar un servicio: campos y de 1 a 5 fotos (campo `fotos`); queda activa' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { ...LISTING_FIELDS, fotos: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('LISTING_PHOTOS', 'Adjunta entre 1 y 5 fotos del servicio.'),
    FilesInterceptor('fotos', MAX_LISTING_PHOTOS, { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: ListingDto, @UploadedFiles() files: UploadedPhoto[] | undefined) {

    return this.listings.create(user.userId, dto, files);
  }

  @ApiOperation({ summary: 'HU-22 Editar los campos de una publicación (no retirada); las fotos van por sus rutas' })
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ListingDto) {

    return this.listings.update(user.userId, BigInt(id), dto);
  }

  @ApiOperation({ summary: 'HU-22 Agregar una foto (campo `foto`), hasta 5' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { foto: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    new UploadErrorsInterceptor('PHOTO_COUNT', 'Adjunta una sola foto.'),
    FileInterceptor('foto', { limits: { fileSize: MAX_IMAGE_BYTES * 2, files: 1 } }),
  )
  @Post(':id/photos')
  addPhoto(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file: UploadedPhoto | undefined) {

    return this.listings.addPhoto(user.userId, BigInt(id), file);
  }

  @ApiOperation({ summary: 'HU-22 Quitar una foto; siempre queda al menos una' })
  @Delete(':id/photos/:photoId')
  removePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {

    return this.listings.removePhoto(user.userId, BigInt(id), BigInt(photoId));
  }

  @ApiOperation({ summary: 'HU-23 Pausar una publicación activa (deja de verse y de recibir solicitudes)' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/pause')
  pause(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.listings.setPaused(user.userId, BigInt(id), true);
  }

  @ApiOperation({ summary: 'HU-23 Volver a activar una publicación pausada' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/activate')
  activate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.listings.setPaused(user.userId, BigInt(id), false);
  }

  @ApiOperation({ summary: 'HU-24 Retirar una publicación (definitivo); solo sin contrataciones abiertas' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/withdraw')
  async withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    await this.listings.withdraw(user.userId, BigInt(id));
  }
}
