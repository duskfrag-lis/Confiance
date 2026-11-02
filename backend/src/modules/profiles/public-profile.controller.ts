import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicProfileService } from './public-profile.service';

/** HU-20: se consulta sin iniciar sesión. Desde aquí el cliente inicia una solicitud (HU-34, en el front). */
@ApiTags('providers')
@Controller('providers')
export class PublicProfileController {

  constructor(private publicProfile: PublicProfileService) {}

  @ApiOperation({ summary: 'HU-20 Perfil público de un prestador' })
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {

    return this.publicProfile.get(BigInt(id));
  }
}
