import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PublicFooter } from '../public-footer/public-footer';
import { PublicHeader } from '../public-header/public-header';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, PublicHeader, PublicFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    main {
      flex: 1;
    }
  `,

  template: `
    <app-public-header />
    <main><router-outlet /></main>
    <app-public-footer />
  `,
})
export class PublicLayout {}
