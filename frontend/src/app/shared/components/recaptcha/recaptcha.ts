import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { FieldError } from '../field-error/field-error';

declare global {

    interface Window {
        grecaptcha?: any;
        __onRecaptchaLoad?: () => void;
    }
}

let loader: Promise<void> | null = null;

function loadRecaptcha(): Promise<void> {

    if (window.grecaptcha?.render) return Promise.resolve();

    loader ??= new Promise<void>((resolve, reject) => {
        window.__onRecaptchaLoad = () => resolve();
        const s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?onload=__onRecaptchaLoad&render=explicit&hl=es-419';
        s.async = true;
        s.onerror = () => { loader = null; reject(new Error('recaptcha')); };
        document.head.appendChild(s);
    });

    return loader;
}

@Component({

    selector: 'app-recaptcha',
    imports: [FieldError],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `:host { display: grid; gap: 0.4rem; }`,
    template: `
        <div #host></div>
        <app-field-error [message]="errorMessage()" />
    `,
})

export class Recaptcha {

    readonly submitted = input(false);
    readonly tokenChange = output<string | null>();

    private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
    private widgetId: number | null = null;
    private readonly token = signal<string | null>(null);
    private readonly loadFailed = signal(false);

    protected readonly errorMessage = computed(() => {

        if (this.loadFailed()) return 'No pudimos cargar el captcha. Recarga la página e inténtalo de nuevo.';

        return this.submitted() && !this.token() ? 'Confirma que no eres un robot.' : null;
    });

    constructor() {

        afterNextRender(() => {
        loadRecaptcha()
            .then(() => {
                this.widgetId = window.grecaptcha.render(this.host().nativeElement, {
                    sitekey: environment.recaptchaSiteKey,
                    callback: (t: string) => this.setToken(t),
                    'expired-callback': () => this.setToken(null),
                    'error-callback': () => this.setToken(null),
                });
            })
            .catch(() => this.loadFailed.set(true));
        });
    }

    reset(): void {

        if (this.widgetId !== null) window.grecaptcha.reset(this.widgetId);

        this.setToken(null);
    }

    private setToken(t: string | null): void {
        
        this.token.set(t);
        this.tokenChange.emit(t);
    }
}