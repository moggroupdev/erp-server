import { Pool, type PoolClient, type QueryConfig } from 'pg';
import { getAuditContext } from 'src/utils/audit/audit.context';

const MUTATION_SQL = /^\s*(insert|update|delete)\b/i;
const AUDIT_LOGS_TARGET = /\b(?:into|update|from)\s+"?audit_logs"?\b/i;

function extractSqlText(queryTextOrConfig: string | QueryConfig | { text?: string }): string | undefined {
  if (typeof queryTextOrConfig === 'string') return queryTextOrConfig;
  if (queryTextOrConfig && typeof queryTextOrConfig === 'object' && 'text' in queryTextOrConfig) {
    return queryTextOrConfig.text;
  }
  return undefined;
}

function shouldInjectGucs(sqlText: string | undefined): boolean {
  if (!sqlText) return false;
  if (!MUTATION_SQL.test(sqlText)) return false;
  if (AUDIT_LOGS_TARGET.test(sqlText)) return false;
  return true;
}

async function applyAuditGucs(query: PoolClient['query']): Promise<void> {
  const ctx = getAuditContext();

  // Clear when no ALS so a recycled connection cannot leak the previous actor.
  const values: [string, string][] = [
    ['erp.operation_id', ctx?.operationId ?? ''],
    ['erp.ip_address', ctx?.ipAddress ?? ''],
    ['erp.user_agent', ctx?.userAgent ?? ''],
    ['erp.actor_user_id', ctx?.actorUserId ?? ''],
    ['erp.actor_name', ctx?.actorName ?? ''],
    [
      'erp.actor_is_admin',
      ctx?.actorIsAdmin === null || ctx?.actorIsAdmin === undefined ? '' : ctx.actorIsAdmin ? 'true' : 'false',
    ],
    ['erp.actor_role_id', ctx?.actorRoleId ?? ''],
    ['erp.actor_department_id', ctx?.actorDepartmentId ?? ''],
    ['erp.audit_skip', ctx?.auditSkip ? 'true' : ''],
  ];

  // is_local = false (session): rewritten on every mutation from ALS; cleared when ALS is empty.
  for (const [key, value] of values) {
    await query('SELECT set_config($1, $2, false)', [key, value]);
  }
}

/**
 * Wrap a PoolClient so every INSERT/UPDATE/DELETE first sets erp.* GUCs from ALS
 * on the same client (required for pooled checkouts; do not SET via a separate Pool.query).
 */
export function wrapPoolClientForAudit(client: PoolClient): void {
  const tagged = client as PoolClient & { __auditGucWrapped?: boolean };
  if (tagged.__auditGucWrapped) return;

  const originalQuery = client.query.bind(client);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.query = ((...args: any[]) => {
    const sqlText = extractSqlText(args[0]);
    if (!shouldInjectGucs(sqlText)) {
      return originalQuery(...args);
    }

    return (async () => {
      await applyAuditGucs(originalQuery);
      return originalQuery(...args);
    })();
  }) as typeof client.query;

  tagged.__auditGucWrapped = true;
}

/**
 * Install connect-time wrapping so every checked-out client (including drizzle transactions)
 * injects audit GUCs before mutations.
 */
export function installAuditGucPoolHook(pool: Pool): void {
  pool.on('connect', (client) => {
    wrapPoolClientForAudit(client);
  });
}
