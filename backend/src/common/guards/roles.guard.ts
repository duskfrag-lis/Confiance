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

    // D-11: no hay rol único; cuenta el perfil activo y, aparte, el indicador de administrador
    return requiredRoles.some((role) =>
      role === 'admin' ? user.isAdmin : role === user.activeProfile,
    );
  }
}