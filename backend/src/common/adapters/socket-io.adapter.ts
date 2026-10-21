import { IoAdapter } from '@nestjs/platform-socket.io';

// Tipos del socket.io que trae @nestjs/platform-socket.io (puede ser otra copia que la del proyecto)
type IoOptions = Parameters<IoAdapter['createIOServer']>[1];
type IoServer = ReturnType<IoAdapter['createIOServer']>;

/**
 * socket.io bajo /api (igual que la API: un solo proxy y las mismas cookies) y con el mismo CORS. Las opciones
 * se leen aquí y no en el decorador del gateway, que se evalúa antes de que ConfigModule cargue el .env.
 */
export class AppIoAdapter extends IoAdapter {

  createIOServer(port: number, options?: IoOptions): IoServer {

    return super.createIOServer(port, {
      ...options,
      path: '/api/socket.io',
      cors: { origin: process.env.CORS_ORIGIN, credentials: true },
    } as IoOptions);
  }
}
