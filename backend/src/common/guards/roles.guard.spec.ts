import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const context = (user: unknown) =>
  ({
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const roles = (r?: string[]) => jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(r);

  it('deja pasar si la ruta no exige roles', () => {
    roles(undefined);
    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('compara con el perfil activo', () => {
    roles(['provider']);
    expect(guard.canActivate(context({ activeProfile: 'provider', isAdmin: false }))).toBe(true);
    expect(guard.canActivate(context({ activeProfile: 'client', isAdmin: false }))).toBe(false);
  });

  it('admin depende del indicador, no del perfil', () => {
    roles(['admin']);
    expect(guard.canActivate(context({ activeProfile: 'client', isAdmin: true }))).toBe(true);
    expect(guard.canActivate(context({ activeProfile: 'provider', isAdmin: false }))).toBe(false);
  });
});
