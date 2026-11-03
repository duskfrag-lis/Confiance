import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** E7 Chat: conversación por contratación entre sus dos partes (HU-42) y aviso de mensajes nuevos (HU-62). */
@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
