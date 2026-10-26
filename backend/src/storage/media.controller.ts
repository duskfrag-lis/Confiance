import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorageService } from './storage.service';

/** Fotos públicas (perfil y evidencias), sin sesión (HU-20), y archivos privados solo con un enlace firmado (HU-60). */
@ApiTags('media')
@Controller('media')
export class MediaController {

  constructor(private storage: StorageService) {}

  @ApiOperation({ summary: 'Foto pública (perfil o evidencia)' })
  @Get(':file')
  async get(@Param('file') file: string, @Res() res: Response) {

    const body = await this.storage.getPublic(file);

    if (!body) throw new NotFoundException();

    // Cada subida tiene un nombre nuevo, así que el archivo nunca cambia
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
    body.pipe(res);
  }

  @ApiOperation({ summary: 'HU-60 Archivo privado (documento o evidencia) con un enlace firmado de corta duración' })
  @Get('private/:folder/:file')
  async getPrivate(
    @Param('folder') folder: string,
    @Param('file') file: string,
    @Query('e') expires: string = '',
    @Query('s') signature: string = '',
    @Res() res: Response,
  ) {

    const found = await this.storage.getPrivate(folder, file, expires, signature);

    // Enlace vencido, alterado o archivo inexistente: la misma respuesta, sin dar pistas
    if (!found) throw new NotFoundException();

    res.set({ 'Content-Type': found.contentType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    found.body.pipe(res);
  }
}
