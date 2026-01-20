import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const actor = (request.user?.id as string) || 'system';
    const action = `${request.method} ${request.url}`;
    const ip = request.ip;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: () => {
          this.auditService.log({
            actor,
            action,
            resource: request.route?.path || request.url || 'unknown',
            resourceId: request.params?.id,
            ip,
            userAgent,
            payload: request.body && Object.keys(request.body).length ? request.body : undefined,
          });
        },
        error: () => {
          // Still attempt to log failures
          this.auditService.log({
            actor,
            action: `${action} [ERROR]`,
            resource: request.route?.path || request.url || 'unknown',
            resourceId: request.params?.id,
            ip,
            userAgent,
            payload: request.body && Object.keys(request.body).length ? request.body : undefined,
          });
        },
      })
    );
  }
}
