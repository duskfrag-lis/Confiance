import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AccountRole, SocialProvider } from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-social-buttons',
  imports: [NgTemplateOutlet],
  templateUrl: './social-buttons.html',
  styleUrl: './social-buttons.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialButtons {
  private readonly auth = inject(AuthService);

  /** En los registros ya se sabe el rol; en el login es null */
  readonly role = input<AccountRole | null>(null);
  /** "Mantener la sesión" del login */
  readonly remember = input(false);
  /** Ruta protegida desde la que se llegó al login (`?volver=`) */
  readonly returnTo = input<string | null>(null);
  readonly dividerLabel = input('');
  /** true: el divisor va arriba de los botones; false: abajo */
  readonly dividerFirst = input(false);

  protected readonly providers: { id: SocialProvider; label: string }[] = [
    { id: 'google', label: 'Google' },
    { id: 'microsoft', label: 'Microsoft' },
  ];

  protected url(provider: SocialProvider): string {
    return this.auth.socialLoginUrl(provider, {
      rol: this.role(),
      recordar: this.remember(),
      volver: this.returnTo(),
    });
  }
}
