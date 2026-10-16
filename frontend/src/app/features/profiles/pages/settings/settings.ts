import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorCode } from '../../../../core/api/api';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
  selector: 'app-settings',
  imports: [RouterLink, Icon],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly user = inject(CurrentUserService);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly understood = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected openDisable(): void {
    this.understood.set(false);
    this.error.set(null);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected disable(): void {
    if (!this.understood() || this.loading()) return;

    this.loading.set(true);
    this.auth
      .disableAccount()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.close();
          this.router.navigate(['/auth/iniciar-sesion'], { queryParams: { sesion: 'deshabilitada' } });
        },
        error: (err) =>
          this.error.set(
            apiErrorCode(err) === 'OPEN_CONTRACTS'
              ? 'Tienes contrataciones sin cerrar. Termínalas o cancélalas antes de deshabilitar tu cuenta.'
              : 'No pudimos deshabilitar tu cuenta. Inténtalo de nuevo en unos minutos.',
          ),
      });
  }
}
