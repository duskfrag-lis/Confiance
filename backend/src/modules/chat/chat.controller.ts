import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { SEND_THROTTLE } from './chat.constants';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MessagesQuery, SendMessageDto } from './dto/chat.dto';

/** HU-42: lo usan las dos partes de la contratación, sin importar el perfil activo. */
@ApiTags('chat')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('contracts/:id/messages')
export class ChatController {

  constructor(
    private chat: ChatService,
    private gateway: ChatGateway,
  ) {}

  @ApiOperation({ summary: 'HU-42 Historial del chat, del más antiguo al más reciente; páginas hacia atrás con antesDe' })
  @Get()
  history(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() query: MessagesQuery) {

    return this.chat.history(user.userId, BigInt(id), query);
  }

  @ApiOperation({ summary: 'HU-42 Enviar un mensaje (solo las partes; solo lectura en RECHAZADO, CANCELADO y COMPLETADO)' })
  @Throttle(SEND_THROTTLE)
  @Post()
  async send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {

    const message = await this.chat.send(user.userId, BigInt(id), dto.texto);
    this.gateway.broadcast(message);
    return message;
  }
}
