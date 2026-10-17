import { Body, Controller, Get, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import {
  ProviderAvailabilityDto,
  ProviderDescriptionDto,
  ProviderTradesDto,
  ProviderZonesDto,
  UpdateClientProfileDto,
} from './dto/profiles.dto';
import { ProfilesService } from './profiles.service';

type UploadedPhoto = { buffer: Buffer; size: number };

@ApiTags('profiles')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('profiles')
export class ProfilesController {

  constructor(private profiles: ProfilesService) {}

  @ApiOperation({ summary: 'HU-11 / HU-13 Foto de la cuenta (JPG o PNG, máximo 5 MB); reemplaza la anterior' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { foto: { type: 'string', format: 'binary' } } } })
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: MAX_IMAGE_BYTES * 2, files: 1 } }))
  @Put('photo')
  updatePhoto(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedPhoto | undefined) {

    return this.profiles.updatePhoto(user.userId, file);
  }

  @ApiOperation({ summary: 'HU-11 Perfil del cliente' })
  @Roles('client')
  @Get('client')
  getClient(@CurrentUser() user: AuthUser) {

    return this.profiles.getClient(user.userId);
  }

  @ApiOperation({ summary: 'HU-11 Editar el perfil del cliente (correo y cédula no se editan)' })
  @Roles('client')
  @Put('client')
  updateClient(@CurrentUser() user: AuthUser, @Body() dto: UpdateClientProfileDto) {

    return this.profiles.updateClient(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-13 Perfil profesional con las secciones que faltan' })
  @Roles('provider')
  @Get('provider')
  getProvider(@CurrentUser() user: AuthUser) {

    return this.profiles.getProvider(user.userId);
  }

  @ApiOperation({ summary: 'HU-15 Descripción profesional (máximo 500 caracteres)' })
  @Roles('provider')
  @Put('provider/description')
  updateDescription(@CurrentUser() user: AuthUser, @Body() dto: ProviderDescriptionDto) {

    return this.profiles.updateDescription(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-14 Oficios del prestador (1 a 3, del catálogo)' })
  @Roles('provider')
  @Put('provider/trades')
  updateTrades(@CurrentUser() user: AuthUser, @Body() dto: ProviderTradesDto) {

    return this.profiles.updateTrades(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-16 Zonas de atención (barrios y/o comunas completas)' })
  @Roles('provider')
  @Put('provider/zones')
  updateZones(@CurrentUser() user: AuthUser, @Body() dto: ProviderZonesDto) {

    return this.profiles.updateZones(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-17 Disponibilidad semanal (día × mañana/tarde/noche); reemplaza la anterior' })
  @Roles('provider')
  @Put('provider/availability')
  updateAvailability(@CurrentUser() user: AuthUser, @Body() dto: ProviderAvailabilityDto) {

    return this.profiles.updateAvailability(user.userId, dto);
  }
}
