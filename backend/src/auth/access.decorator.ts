import { SetMetadata } from '@nestjs/common';

export const ACCESS_KEY = 'routeAccess';

export type AccessAction = 'read' | 'write' | 'approve' | 'admin';

export interface RouteAccess {
  module: string;
  action: AccessAction;
}

export const Access = (module: string, action: AccessAction = 'read') =>
  SetMetadata(ACCESS_KEY, { module, action } as RouteAccess);
