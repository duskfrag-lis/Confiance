import { IoAdapter } from '@nestjs/platform-socket.io';

/** Tipos tal como los declara IoAdapter: usa su propia copia de socket.io, distinta de la del proyecto. */
type IoOptions = NonNullable<Parameters<IoAdapter['createIOServer']>[1]>;
type IoServer = ReturnType<IoAdapter['createIOServer']>;

/**
 * socket.io bajo /api (nginx solo reenvía /api/ al backend) y con el mismo CORS que la API. Se lee al arrancar,
 * cuando process.env ya tiene el .env; en el decorador del gateway todavía no.
 */
export class AppIoAdapter extends IoAdapter {

  createIOServer(port: number, options?: IoOptions): IoServer {

    // socket.io declara todas sus opciones como obligatorias aunque cada una tiene valor por defecto
    return super.createIOServer(port, {
      ...options,
      path: '/api/socket.io',
      cors: { origin: process.env.CORS_ORIGIN, credentials: true },
    } as IoOptions);
  }
}
