import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { authError } from '../../modules/auth/auth.constants';
import type { AuthUser } from '../types/auth-user';

/**
 * D-57: registrar la información bancaria (HU-18) o enviar documentos de identidad (HU-55) exige el
 * correo verificado. Así, quien crea una cuenta con un correo ajeno no puede dejar sus datos.
 * Va después de JwtAuthGuard: `@UseGuards(JwtAuthGuard, VerifiedEmailGuard)`.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;

    if (!user) return false;

    const found = await this.prisma.users.findUnique({
      where: { user_id: user.userId },
      select: { email_verified: true },
    });

    if (!found?.email_verified) {

      throw authError(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', 'Verifica tu correo para continuar con este paso.');
    }

    return true;
  }
}
