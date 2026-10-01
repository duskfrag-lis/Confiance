import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorBriefcase,
  phosphorCheck,
  phosphorCheckCircle,
  phosphorEnvelopeSimple,
  phosphorEye,
  phosphorEyeSlash,
  phosphorLock,
  phosphorMagnifyingGlass,
  phosphorUser,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

const ICONS = {
  user: 'phosphorUser',
  briefcase: 'phosphorBriefcase',
  mail: 'phosphorEnvelopeSimple',
  lock: 'phosphorLock',
  eye: 'phosphorEye',
  'eye-off': 'phosphorEyeSlash',
  'arrow-left': 'phosphorArrowLeft',
  'triangle-alert': 'phosphorWarning',
  check: 'phosphorCheck',
  'circle-check': 'phosphorCheckCircle',
  search: 'phosphorMagnifyingGlass',
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,

  viewProviders: [
    provideIcons({
      phosphorArrowLeft,
      phosphorBriefcase,
      phosphorCheck,
      phosphorCheckCircle,
      phosphorEnvelopeSimple,
      phosphorEye,
      phosphorEyeSlash,
      phosphorLock,
      phosphorMagnifyingGlass,
      phosphorUser,
      phosphorWarning,
    }),
  ],

  host: { 'aria-hidden': 'true', style: 'display:inline-flex;flex:none' },
  template: `<ng-icon [name]="icon()" [size]="size() + 'px'" />`,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  protected readonly icon = computed(() => ICONS[this.name()]);
}
