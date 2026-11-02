import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, type Role } from "../decorators/roles.decorator";
import type { AuthUser } from "../types/auth-user";

@Injectable()
export class RolesGuard implements CanActivate {

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [

      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;

    if (!user) return false;

    // D-11: cuenta el perfil activo y, aparte, el indicador de administrador.
    // Decidido el 2026-10-31: una cuenta de administrador es exclusiva y nunca actúa como cliente ni como prestador.
    return requiredRoles.some((role) =>
      role === 'admin' ? user.isAdmin : !user.isAdmin && role === user.activeProfile,
    );
  }
}