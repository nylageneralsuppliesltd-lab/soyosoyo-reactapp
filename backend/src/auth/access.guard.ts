import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY, RouteAccess } from './access.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private hasRolePermission(role: string, module: string, action: string): boolean {
    const roleName = String(role || 'Member');

    const roleRules: Record<string, Record<string, string[]>> = {
      Admin: {
        '*': ['read', 'write', 'approve', 'admin'],
      },
      Treasurer: {
        members: ['read'],
        deposits: ['read', 'write', 'approve'],
        withdrawals: ['read', 'write', 'approve'],
        loans: ['read', 'write', 'approve'],
        reports: ['read'],
        settings: ['read'],
        dashboard: ['read'],
      },
      Accountant: {
        members: ['read'],
        deposits: ['read', 'write'],
        withdrawals: ['read', 'write'],
        loans: ['read', 'write'],
        reports: ['read'],
        settings: ['read'],
        dashboard: ['read'],
      },
      Secretary: {
        members: ['read', 'write'],
        deposits: ['read'],
        withdrawals: ['read'],
        loans: ['read'],
        reports: ['read'],
        settings: ['read'],
        dashboard: ['read'],
      },
      Member: {
        members: ['read'],
        deposits: ['read'],
        withdrawals: ['read'],
        loans: ['read'],
        reports: ['read'],
        dashboard: ['read'],
      },
    };

    const current = roleRules[roleName] || roleRules.Member;
    const wildcard = current['*'];
    if (wildcard && wildcard.includes(action)) return true;

    const moduleRules = current[module] || [];
    return moduleRules.includes(action);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const access = this.reflector.getAllAndOverride<RouteAccess>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!access) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user || {};

    if (user?.isSystemDeveloper && user?.developerMode) {
      return true;
    }

    if (user?.adminCriteria === 'Admin' || user?.role === 'Admin') {
      return true;
    }

    const allowed = this.hasRolePermission(user?.role, access.module, access.action);
    if (!allowed) {
      throw new ForbiddenException(`Insufficient permission for ${access.module}:${access.action}`);
    }

    return true;
  }
}
