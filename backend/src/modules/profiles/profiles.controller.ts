import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import {
  BankAccountDto,
  CreateEvidenceDto,
  ProviderAvailabilityDto,
  ProviderDescriptionDto,
  ProviderTradesDto,
  ProviderZonesDto,
  UpdateClientProfileDto,
} from './dto/profiles.dto';
import { BankAccountService } from './bank-account.service';
import { EvidenceService } from './evidence.service';
import { MAX_EVIDENCE_PHOTOS } from './profiles.constants';
import { ProfilesService } from './profiles.service';

type UploadedPhoto = { buffer: Buffer; size: number };

@ApiTags('profiles')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('profiles')
export class ProfilesController {

  constructor(
    private profiles: ProfilesService,
    private bank: BankAccountService,
    private evidence: EvidenceService,
  ) {}

  @ApiOperation({ summary: 'HU-11 / HU-13 Foto de la cuenta (JPG o PNG, máximo 5 MB); reemplaza la anterior' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { foto: { type: 'string', format: 'binary' } } } })
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde IMAGE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('PHOTO_COUNT', 'Adjunta una sola foto.'),
    FileInterceptor('foto', { limits: { fileSize: MAX_IMAGE_BYTES * 2, files: 1 } }),
  )
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

  @ApiOperation({ summary: 'HU-18 Información bancaria propia (null si no la ha registrado); `editable` dice si se puede cambiar' })
  @Roles('provider')
  @Get('provider/bank-account')
  getBankAccount(@CurrentUser() user: AuthUser) {

    return this.bank.getOwn(user.userId);
  }

  @ApiOperation({
    summary: 'HU-18 Registrar o editar la información bancaria (exige correo verificado, D-57). '
      + 'No se puede cambiar con contrataciones de ACEPTADO a FINALIZADO (D-58)',
  })
  @Roles('provider')
  @UseGuards(VerifiedEmailGuard)
  @Put('provider/bank-account')
  updateBankAccount(@CurrentUser() user: AuthUser, @Body() dto: BankAccountDto) {

    return this.bank.upsert(user.userId, dto);
  }

  @ApiOperation({ summary: 'HU-18.2 Datos bancarios de un prestador, solo con una contratación aceptada con él' })
  @Roles('client')
  @Get('providers/:id/bank-account')
  getProviderBankAccount(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.bank.getForClient(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-19 Mis evidencias (incluye las retiradas, marcadas)' })
  @Roles('provider')
  @Get('provider/evidences')
  listEvidences(@CurrentUser() user: AuthUser) {

    return this.evidence.listOwn(user.userId);
  }

  @ApiOperation({ summary: 'HU-19 Cargar una evidencia: 1 a 5 fotos (campo `fotos`) y descripción; se publica al instante' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { descripcion: { type: 'string' }, fotos: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @Roles('provider')
  @UseInterceptors(
    new UploadErrorsInterceptor('EVIDENCE_PHOTOS', 'Adjunta entre 1 y 5 fotos del trabajo.'),
    FilesInterceptor('fotos', MAX_EVIDENCE_PHOTOS, { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @Post('provider/evidences')
  createEvidence(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEvidenceDto,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ) {

    return this.evidence.create(user.userId, dto, files);
  }

  @ApiOperation({ summary: 'HU-19.3 Retirar una evidencia propia (deja de mostrarse, se conserva)' })
  @Roles('provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('provider/evidences/:id/withdraw')
  async withdrawEvidence(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    await this.evidence.withdraw(user.userId, BigInt(id));
  }
}
