import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { RateDto } from './dto/reputation.dto';
import { ReputationService } from './reputation.service';

/** HU-49: califican las dos partes, cada una a la otra. */
@ApiTags('contracts')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ReputationController {

  constructor(private reputation: ReputationService) {}

  @ApiOperation({ summary: 'HU-49 Calificar a la otra parte (en COMPLETADO, una vez por contratación)' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/rating')
  rate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RateDto) {

    return this.reputation.rate(user.userId, BigInt(id), dto);
  }
}
