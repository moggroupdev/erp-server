import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { REQUEST_USER_KEY } from 'src/utils/constants';
import { setAuditActor } from 'src/utils/audit/audit.context';
import { User } from 'src/utils/types';

/**
 * Runs after auth guards. Copies actor snapshots into the mutable ALS store
 * established by AuditContextMiddleware (so RxJS does not need to re-enter ALS).
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { [REQUEST_USER_KEY]?: User }>();
    const user = request[REQUEST_USER_KEY];

    if (user) {
      setAuditActor({
        actorUserId: user.id,
        actorName: user.name,
        actorIsAdmin: user.isAdmin,
        actorRoleId: user.roleId,
        actorDepartmentId: user.departmentId,
      });
    }

    return next.handle();
  }
}
