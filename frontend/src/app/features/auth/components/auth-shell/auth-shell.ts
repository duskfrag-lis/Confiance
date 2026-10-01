import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-auth-shell',
  imports: [RouterLink, Icon],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShell {
  readonly heroTitle = input.required<string>();
  readonly heroSubtitle = input<string>('');
  readonly heroItems = input<string[]>([]);
}
