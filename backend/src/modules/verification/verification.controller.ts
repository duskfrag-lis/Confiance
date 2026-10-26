import { Body, Controller, Get, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import { SubmitVerificationDto } from './dto/verification.dto';
import { MAX_VERIFICATION_PHOTOS } from './verification.constants';
import { VerificationService } from './verification.service';

type UploadedPhoto = { buffer: Buffer; size: number };

/** HU-55: el prestador solicita la verificación de su identidad y sigue su estado. */
@ApiTags('verification')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('provider')
@Controller('verification')
export class VerificationController {

  constructor(private verification: VerificationService) {}

  @ApiOperation({ summary: 'HU-55 Tipos de documento aceptados (sin NIT, HU-55.1)' })
  @Get('document-types')
  documentTypes() {

    return this.verification.documentTypes();
  }

  @ApiOperation({ summary: 'HU-55.4 Mi verificación: estado, la solicitud más reciente con su motivo y las anteriores' })
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {

    return this.verification.mine(user.userId);
  }

  @ApiOperation({ summary: 'HU-55 Enviar una solicitud (exige correo verificado, D-57): de 1 a 5 fotos en `fotos`; queda pendiente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tipoDocumento', 'numero', 'fotos'],
      properties: {
        tipoDocumento: { type: 'string' },
        numero: { type: 'string' },
        informacion: { type: 'string' },
        fotos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseGuards(VerifiedEmailGuard)
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('VERIFICATION_PHOTOS', 'Puedes adjuntar máximo 5 fotos.'),
    FilesInterceptor('fotos', MAX_VERIFICATION_PHOTOS, { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitVerificationDto, @UploadedFiles() files: UploadedPhoto[] | undefined) {

    return this.verification.submit(user.userId, dto, files);
  }
}
