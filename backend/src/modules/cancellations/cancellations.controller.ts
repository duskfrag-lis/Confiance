import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { MAX_IMAGE_BYTES } from '../../storage/storage.service';
import { UploadErrorsInterceptor } from '../../storage/upload-errors.interceptor';
import { CancellationsService } from './cancellations.service';
import { CancelContractDto, RescheduleDto, RespondRescheduleDto } from './dto/cancellations.dto';

type UploadedEvidence = { buffer: Buffer; size: number };

/** HU-50, HU-51 y HU-53: cualquiera de las dos partes, sin importar el perfil activo (la parte se deduce de la contratación). */
@ApiTags('contracts')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class CancellationsController {

  constructor(private cancellations: CancellationsService) {}

  @ApiOperation({ summary: 'HU-50 y HU-51 Cancelar con motivo; por fuerza mayor también en EN_CURSO, con evidencia opcional (JPG, PNG o PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['motivo'],
      properties: {
        motivo: { type: 'string', maxLength: 500 },
        fuerzaMayor: { type: 'boolean', default: false },
        evidencia: { type: 'string', format: 'binary' },
      },
    },
  })
  // El límite de multer es el doble para no cortar la subida a medias: el servicio responde EVIDENCE_TOO_LARGE
  @UseInterceptors(
    new UploadErrorsInterceptor('EVIDENCE_COUNT', 'Adjunta una sola evidencia.'),
    FileInterceptor('evidencia', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelContractDto,
    @UploadedFile() evidence: UploadedEvidence | undefined,
  ) {

    return this.cancellations.cancel(user.userId, BigInt(id), dto, evidence);
  }

  @ApiOperation({ summary: 'HU-53 Proponer un nuevo horario (ACEPTADO o CONFIRMADO; una pendiente a la vez, máximo 2)' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RescheduleDto) {

    return this.cancellations.reschedule(user.userId, BigInt(id), dto);
  }

  @ApiOperation({ summary: 'HU-53.3 Aceptar o rechazar la propuesta de horario de la otra parte' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/reschedule/respond')
  respond(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RespondRescheduleDto) {

    return this.cancellations.respond(user.userId, BigInt(id), dto);
  }
}
