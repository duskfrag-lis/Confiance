import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { PendingVerification } from '../../services/pending-verification';
import { CheckEmail } from './check-email';

describe('CheckEmail', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckEmail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(PendingVerification).set(null);
  });

  it('si se perdió el correo del registro, deja escribirlo para reenviar el enlace', () => {
    const fixture = TestBed.createComponent(CheckEmail);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=email]');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    expect(button.disabled).toBe(true);

    input.value = 'Laura@Gmail.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button.click();

    const req = TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/auth/resend-verification`);
    expect(req.request.body).toEqual({ email: 'laura@gmail.com' });
  });
});
