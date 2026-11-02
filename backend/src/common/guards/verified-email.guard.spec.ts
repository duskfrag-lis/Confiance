import { ExecutionContext, HttpException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { VerifiedEmailGuard } from './verified-email.guard';

describe('VerifiedEmailGuard (D-57)', () => {
  const findUnique = jest.fn();
  const guard = new VerifiedEmailGuard({ users: { findUnique } } as unknown as PrismaService);

  const context = (user?: object) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  const authUser = { userId: 7n, sessionId: 1n, activeProfile: 'provider', isAdmin: false };

  it('deja pasar una cuenta con el correo verificado', async () => {
    findUnique.mockResolvedValue({ email_verified: true });

    await expect(guard.canActivate(context(authUser))).resolves.toBe(true);
  });

  it('responde 403 EMAIL_NOT_VERIFIED si el correo no está verificado', async () => {
    findUnique.mockResolvedValue({ email_verified: false });

    const err = await guard.canActivate(context(authUser)).catch((e: HttpException) => e);

    expect((err as HttpException).getStatus()).toBe(403);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('sin usuario autenticado no deja pasar', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(false);
  });
});
