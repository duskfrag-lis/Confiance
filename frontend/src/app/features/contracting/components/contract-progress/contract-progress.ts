import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../../../../shared/components/icon/icon';
import { ContractStatus, FLOW, STATUS_LABEL } from '../../models/contract';

type StepState = 'done' | 'current' | 'todo' | 'stopped';

@Component({
  selector: 'app-contract-progress',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    ol {
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.45rem;
      text-align: center;
      font-size: 0.875rem;
      color: var(--c-muted);
    }
    li + li::before {
      content: '';
      position: absolute;
      top: 14px;
      right: calc(50% + 18px);
      left: calc(-50% + 18px);
      height: 3px;
      border-radius: 3px;
      background: var(--c-border);
    }
    li[data-state='done'] + li::before,
    li[data-state='done'] + li[data-state='current']::before {
      background: var(--c-success);
    }
    li + li[data-state='stopped']::before {
      background: var(--c-error);
    }
    .dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--c-surface-3);
      color: var(--c-muted);
      font-weight: 700;
      font-size: 0.8125rem;
    }
    [data-state='done'] .dot {
      background: var(--c-success);
      color: var(--c-white);
    }
    [data-state='current'] {
      color: var(--c-text);
      font-weight: 700;
      .dot {
        background: var(--c-accent);
        color: var(--c-white);
        box-shadow: 0 0 0 5px var(--c-accent-soft);
      }
    }
    [data-state='stopped'] {
      color: var(--c-error);
      font-weight: 700;
      .dot {
        background: var(--c-error);
        color: var(--c-white);
      }
    }
    @media (max-width: 560px) {
      .label {
        display: none;
      }
      [data-state='current'] .label,
      [data-state='stopped'] .label {
        display: block;
        white-space: nowrap;
      }
    }
  `,
  template: `
    <ol [attr.aria-label]="'Progreso: ' + label(status())">
      @for (s of steps(); track s.status; let i = $index) {
        <li [attr.data-state]="s.state" [attr.aria-current]="s.state === 'current' ? 'step' : null">
          <span class="dot">
            @switch (s.state) {
              @case ('done') { <app-icon name="check" [size]="16" /> }
              @case ('stopped') { <app-icon name="x" [size]="16" /> }
              @default { {{ i + 1 }} }
            }
          </span>
          <span class="label">{{ label(s.status) }}</span>
        </li>
      }
    </ol>
  `,
})
export class ContractProgress {
  
  readonly status = input.required<ContractStatus>();

  readonly reached = input<ContractStatus>('solicitado');

  protected readonly label = (s: ContractStatus) => STATUS_LABEL[s];

  protected readonly steps = computed<{ status: ContractStatus; state: StepState }[]>(() => {
    const status = this.status();

    if (status === 'rechazado' || status === 'cancelado') {
      const until = FLOW.indexOf(this.reached());
      return [
        ...FLOW.slice(0, until + 1).map((s) => ({ status: s, state: 'done' as const })),
        { status, state: 'stopped' },
      ];
    }

    const current = FLOW.indexOf(status);
    return FLOW.map((s, i) => ({
      status: s,
      state: i < current || status === 'completado' ? 'done' : i === current ? 'current' : 'todo',
    }));
  });
}
