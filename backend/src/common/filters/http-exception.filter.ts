import {

  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger,
} from '@nestjs/common';

import { Response } from 'express';

@Catch()

export class HttpExceptionFilter implements ExceptionFilter {

  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Un error inesperado responde un mensaje genérico; sin este registro no quedaría rastro de la causa
    if (!(exception instanceof HttpException)) {

      const { method, originalUrl } = ctx.getRequest<{ method: string; originalUrl: string }>();
      this.logger.error(`${method} ${originalUrl}`, exception instanceof Error ? exception.stack : String(exception));
    }

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Error interno del servidor';

    response.status(status).json({
        
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}