import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { SocketAuthService } from './socket-auth.service';

/** E7 Comunicación: chat por contratación (HU-42). Quién escribe y cuándo: D-53 (también lo revisa la base). */
@Module({
  imports: [NotificationsModule, AuthModule, JwtModule.register({})],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, SocketAuthService],
})
export class ChatModule {}
