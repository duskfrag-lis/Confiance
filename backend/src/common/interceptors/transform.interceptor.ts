import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { success: true; data: T } | T> {

  intercept(context: ExecutionContext, next: CallHandler): Observable<{ success: true; data: T } | T> {

    // Solo HTTP: las respuestas del chat por WebSocket ya traen su propio `{ ok, ... }` (ChatGateway)
    if (context.getType() !== 'http') return next.handle();

    return next.handle().pipe(map((data) => ({ success: true, data })));
  }
}
