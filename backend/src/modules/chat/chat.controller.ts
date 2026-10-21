import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MessagesQuery, SendMessageDto } from './dto/chat.dto';

/** HU-42: el chat de una contratación, para sus dos partes (cualquier perfil activo). */
@ApiTags('chat')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('contracts/:id/messages')
export class ChatController {

  constructor(
    private chat: ChatService,
    private gateway: ChatGateway,
  ) {}

  @ApiOperation({ summary: 'HU-42 Historial del chat por páginas de 50 (`antes` = id del mensaje más antiguo que ya se tiene)' })
  @Get()
  history(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() query: MessagesQuery) {

    return this.chat.history(user.userId, BigInt(id), query.antes ? BigInt(query.antes) : undefined);
  }

  @ApiOperation({ summary: 'HU-42 Enviar un mensaje (también por WebSocket); la otra parte lo recibe en tiempo real' })
  @Post()
  async send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {

    const message = await this.chat.send(user.userId, BigInt(id), dto.texto);
    this.gateway.broadcast(message);
    return message;
  }
}
