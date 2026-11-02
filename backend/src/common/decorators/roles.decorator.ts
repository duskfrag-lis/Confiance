import { SetMetadata } from "@nestjs/common";
import type { ProfileName } from "../types/auth-user";

/** 'client' y 'provider' se comparan con el perfil activo; 'admin', con users.is_admin (D-11). Un administrador no tiene los otros dos (decidido el 2026-10-31). */
export type Role = ProfileName | 'admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);