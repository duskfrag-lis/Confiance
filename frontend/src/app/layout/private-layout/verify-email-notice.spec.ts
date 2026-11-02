import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CurrentUser } from '../../core/models/current-user';
import { CurrentUserService } from '../../core/services/current-user.service';
import { VerifyEmailNotice } from './verify-email-notice';

describe('VerifyEmailNotice (HU-05.4)', () => {
  let backend: HttpTestingController;
  let session: CurrentUserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VerifyEmailNotice],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(CurrentUserService);
  });

  const render = (emailVerificado: boolean) => {
    session.set({ email: 'laura@gmail.com', emailVerificado } as CurrentUser);
    const fixture = TestBed.createComponent(VerifyEmailNotice);
    fixture.detectChanges();
    return fixture;
  };

  it('no aparece si el correo ya está verificado', () => {
    expect(render(true).nativeElement.textContent.trim()).toBe('');
  });

  it('reenvía el enlace con la sesión iniciada y confirma a qué correo', () => {
    const fixture = render(false);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    backend.expectOne({ method: 'POST', url: `${environment.apiUrl}/auth/me/resend-verification` }).flush(null);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('laura@gmail.com');
    expect(button.disabled).toBe(true);
    backend.verify();
  });
});
