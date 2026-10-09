import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AuthUser } from "../types/auth-user";

/**
 * @Roles('client' | 'provider' | 'admin'). 'client' y 'provider' se comparan con el perfil activo
 * de la cuenta; 'admin' con el indicador is_admin, que es independiente del perfil (D-11, RN-001).
 * Debe usarse después de JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [

      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;

    if (!user) return false;

    return requiredRoles.some((role) => (role === 'admin' ? user.isAdmin : role === user.activeProfile));
  }
}
