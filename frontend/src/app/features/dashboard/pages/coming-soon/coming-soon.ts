import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrentUserService } from '../../../../core/services/current-user.service';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: 4rem 1.5rem;
    }
    .box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      max-width: 460px;
      padding: 2.5rem 2rem;
      border: 1px dashed var(--c-border);
      border-radius: 16px;
      background: var(--c-surface-2);
      text-align: center;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
    }
    p {
      color: var(--c-muted);
    }
    .btn {
      margin-top: 0.75rem;
    }
  `,
  template: `
    <div class="box reveal">
      <span class="icon-tile"><app-icon name="wrench" [size]="30" /></span>
      <h1>{{ title }}</h1>
      <p>Esta sección está en construcción.</p>
      <a class="btn btn--outline" [routerLink]="home()">Volver al inicio</a>
    </div>
  `,
})

export class ComingSoon {
  protected readonly home = inject(CurrentUserService).home;
  protected readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? 'Próximamente';
}
