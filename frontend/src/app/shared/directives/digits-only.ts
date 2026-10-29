import { Directive, booleanAttribute, inject, input, numberAttribute } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'input[appDigitsOnly]',
  host: { '(input)': 'onInput($event)', inputmode: 'numeric' },
})
export class DigitsOnly {
  readonly appDigitsOnly = input.required({ transform: numberAttribute });
  readonly phoneFormat = input(false, { transform: booleanAttribute });

  private readonly control = inject(NgControl, { optional: true, self: true });

  protected onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, this.appDigitsOnly());
    const value = this.phoneFormat() ? digits.replace(/^(\d{3})(\d{1,3})?(\d{1,4})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' ')) : digits;
    if (value === el.value) return;
    el.value = value;
    this.control?.control?.setValue(value);
  }
}
