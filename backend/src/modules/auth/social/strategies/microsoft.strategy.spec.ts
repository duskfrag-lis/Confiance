import { ConfigService } from '@nestjs/config';
import { MicrosoftStrategy } from './microsoft.strategy';

const strategy = (tenant?: string) => {
  const env: Record<string, string | undefined> = {
    MICROSOFT_CLIENT_ID: 'id',
    MICROSOFT_CLIENT_SECRET: 'secret',
    MICROSOFT_CALLBACK_URL: 'http://localhost:3000/api/auth/microsoft/callback',
    MICROSOFT_TENANT: tenant,
  };
  const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as unknown as ConfigService;

  return new MicrosoftStrategy(config);
};

const me = { _json: { id: 'ms-1', mail: null, userPrincipalName: 'Laura@Outlook.com', givenName: 'Laura', surname: 'Gómez' } };

describe('MicrosoftStrategy (D-56)', () => {
  it('con cuentas personales (consumers) da el correo por verificado', () => {
    expect(strategy('consumers').validate('', '', me)).toMatchObject({ email: 'laura@outlook.com', emailVerified: true });
  });

  it('usa consumers si no se configura el tenant', () => {
    expect(strategy().validate('', '', me).emailVerified).toBe(true);
  });

  it('con un tenant de organización no confía en el correo', () => {
    expect(strategy('common').validate('', '', me).emailVerified).toBe(false);
  });
});
