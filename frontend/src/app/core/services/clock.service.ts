import { Injectable, signal } from '@angular/core';

/** Hora actual que se refresca cada 30 s, para plazos y cuentas regresivas. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly tick = signal(Date.now());
  readonly now = this.tick.asReadonly();

  constructor() {
    setInterval(() => this.tick.set(Date.now()), 30_000);
  }
}
