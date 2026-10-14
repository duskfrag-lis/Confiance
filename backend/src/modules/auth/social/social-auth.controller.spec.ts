import { SocialAuthController } from './social-auth.controller';

describe('SocialAuthController', () => {
  it('aplica el límite estricto de intentos a las rutas de OAuth', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', SocialAuthController)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', SocialAuthController)).toBe(60_000);
  });
});
