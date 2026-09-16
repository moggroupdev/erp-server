import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { createAuditContext, runWithAuditContext } from 'src/utils/audit/audit.context';

function resolveIpAddress(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return req.ip ?? req.socket.remoteAddress ?? null;
}

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const context = createAuditContext({
      ipAddress: resolveIpAddress(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    runWithAuditContext(context, () => next());
  }
}
