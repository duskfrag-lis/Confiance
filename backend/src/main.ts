import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de nginx (Docker): la IP real del cliente llega en X-Forwarded-For.
  // Sin esto, el límite de intentos contaría a todos los usuarios como uno solo.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

  app.setGlobalPrefix('api');
  
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({

    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });

  app.useGlobalPipes(

    appValidationPipe(),
  );

  const config = new DocumentBuilder()
    .setTitle('Confiance API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

