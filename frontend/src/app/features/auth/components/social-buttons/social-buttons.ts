import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AccountRole, SocialProvider } from '../../models/auth.models';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-social-buttons',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './social-buttons.html',
  styleUrl: './social-buttons.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialButtons {
  private readonly auth = inject(AuthService);

  /** En los registros ya se sabe el rol; en el login es null */
  readonly role = input<AccountRole | null>(null);
  readonly dividerLabel = input('');
  /** true: el divisor va arriba de los botones; false: abajo */
  readonly dividerFirst = input(false);

  /** Simulación: navega dentro de la SPA en vez de salir al proveedor (sin recargar) */
  protected readonly mock = environment.mockSocialAuth;

  protected readonly providers: { id: SocialProvider; label: string }[] = [
    { id: 'google', label: 'Google' },
    { id: 'microsoft', label: 'Microsoft' },
  ];

  protected url(provider: SocialProvider): string {
    return this.auth.socialLoginUrl(provider, this.role());
  }
}
