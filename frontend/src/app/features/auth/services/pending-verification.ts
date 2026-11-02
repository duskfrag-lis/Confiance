import { Injectable, signal } from '@angular/core';

const KEY = 'confiance.pendingEmail';

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class PendingVerification {
  private readonly _email = signal<string | null>(read());
  readonly email = this._email.asReadonly();

  set(email: string | null): void {
    this._email.set(email);
    try {
      if (email) sessionStorage.setItem(KEY, email);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* sessionStorage no disponible: el signal igual funciona */
    }
  }
}
