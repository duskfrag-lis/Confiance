import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorageService } from './storage.service';

/** Fotos públicas (perfil y evidencias): se ven sin iniciar sesión (HU-20). Los documentos privados no pasan por aquí. */
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
}
