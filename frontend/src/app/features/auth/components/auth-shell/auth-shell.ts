import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { Brand } from '../../../../shared/components/brand/brand';
import { Icon } from '../../../../shared/components/icon/icon';

@Component({
  selector: 'app-auth-shell',
  imports: [Icon, Brand],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-wide]': 'wide()' },
})
export class AuthShell {
  readonly heroTitle = input.required<string>();
  readonly heroSubtitle = input<string>('');
  readonly heroItems = input<string[]>([]);
  /** Formularios largos (registro): panel más ancho para usar dos columnas. */
  readonly wide = input(false, { transform: booleanAttribute });
}
