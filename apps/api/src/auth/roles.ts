import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type AppRole = 'owner' | 'supervisor' | 'admin' | 'viewer';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

const roleHierarchy: Record<AppRole, number> = {
  owner: 4,
  supervisor: 3,
  admin: 2,
  viewer: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return false;

    const { user } = context.switchToHttp().getRequest();
    const userLevel = roleHierarchy[user?.role as AppRole] ?? 0;
    // NOTE: this is a strict TIER model, not an allowlist. `@Roles('a','b')`
    // resolves to the *lowest* tier listed and grants it + everything above —
    // so `@Roles('admin')` already covers supervisor/owner. Listing extra roles
    // is cosmetic. If a future role ever needs powers WITHOUT inheriting a lower
    // tier's access, this guard cannot express it — switch to an explicit
    // permission/allowlist model before adding such a role.
    const minimumLevel = Math.min(...required.map((role) => roleHierarchy[role]));
    return userLevel >= minimumLevel;
  }
}
