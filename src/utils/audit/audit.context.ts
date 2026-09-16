import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditContext = {
  operationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorIsAdmin: boolean | null;
  actorRoleId: string | null;
  actorDepartmentId: string | null;
  /** When true, DB trigger skips writing audit_logs (seed scripts). */
  auditSkip: boolean;
};

const auditStorage = new AsyncLocalStorage<AuditContext>();

export function createAuditContext(partial?: Partial<AuditContext>): AuditContext {
  return {
    operationId: partial?.operationId ?? randomUUID(),
    ipAddress: partial?.ipAddress ?? null,
    userAgent: partial?.userAgent ?? null,
    actorUserId: partial?.actorUserId ?? null,
    actorName: partial?.actorName ?? null,
    actorIsAdmin: partial?.actorIsAdmin ?? null,
    actorRoleId: partial?.actorRoleId ?? null,
    actorDepartmentId: partial?.actorDepartmentId ?? null,
    auditSkip: partial?.auditSkip ?? false,
  };
}

export function runWithAuditContext<T>(context: AuditContext, fn: () => T): T {
  return auditStorage.run(context, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return auditStorage.getStore();
}

export function setAuditActor(
  actor: Pick<AuditContext, 'actorUserId' | 'actorName' | 'actorIsAdmin' | 'actorRoleId' | 'actorDepartmentId'>,
): void {
  const store = auditStorage.getStore();
  if (!store) return;
  store.actorUserId = actor.actorUserId;
  store.actorName = actor.actorName;
  store.actorIsAdmin = actor.actorIsAdmin;
  store.actorRoleId = actor.actorRoleId;
  store.actorDepartmentId = actor.actorDepartmentId;
}
