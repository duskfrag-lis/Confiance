import { HttpErrorResponse } from '@angular/common/http';
import { OperatorFunction, map } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export const unwrap = <T>(): OperatorFunction<ApiResponse<T>, T> => map((r) => r.data);

export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const message = (err.error as { message?: { code?: string } } | null)?.message;
  return typeof message === 'object' && message?.code ? message.code : null;
}
