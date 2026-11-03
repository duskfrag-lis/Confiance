import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { SEND_THROTTLE } from './chat.constants';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';

/**
 * HU-42 · Chat por contratación. Se envía por HTTP y la interfaz consulta la conversación cada pocos segundos.
 * Lo usan las dos partes sin importar el perfil activo; la lista de chats sí sigue al perfil activo, como HU-12.
 */
@ApiTags('chat')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ChatController {

  constructor(private chat: ChatService) {}

  @ApiOperation({ summary: 'HU-42 Mis chats: una conversación por contratación del perfil activo, con el último mensaje y los sin leer' })
  @Get('chats/mine')
  mine(@CurrentUser() user: AuthUser) {

    return this.chat.mine(user);
  }

  @ApiOperation({ summary: 'HU-42 Conversación de una contratación (de lo más viejo a lo más nuevo) y hasta dónde leyó la otra parte' })
  @Get('contracts/:id/messages')
  thread(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    return this.chat.thread(user.userId, BigInt(id));
  }

  @ApiOperation({ summary: 'HU-42 Enviar un mensaje (de SOLICITADO a FINALIZADO; después es de solo lectura, D-53)' })
  @Throttle(SEND_THROTTLE)
  @Post('contracts/:id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {

    return this.chat.send(user.userId, BigInt(id), dto.texto);
  }

  @ApiOperation({ summary: 'HU-42 y HU-62 Marcar la conversación como leída (y su aviso de mensajes nuevos)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('contracts/:id/messages/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {

    await this.chat.markRead(user.userId, BigInt(id));
  }
}
