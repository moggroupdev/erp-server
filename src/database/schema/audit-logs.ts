import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, varchar, boolean, jsonb, index, check } from 'drizzle-orm/pg-core';
import { createdAt, auditActionEnum } from './common';
import { users } from './users';

/**
 * Append-only audit trail for row mutations across all tables.
 * Never update or delete rows. Do not audit this table or login_history.
 * Snapshots must redact users.password as "[redacted]".
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Identity of the changed row (polymorphic — mixed PK types across schema)
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(), // uuid/text/enum as text; permissions: {roleId}/{permission}
    action: auditActionEnum('action').notNull(),
    // Full row snapshots for forensic reconstruction; password never stored
    oldRow: jsonb('old_row'), // Null on insert
    newRow: jsonb('new_row'), // Null on delete
    changedColumns: text('changed_columns').array(), // Null on insert/delete; snake_case column names that differed on update
    // Actor — null for scripts/migrations
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorName: text('actor_name'), // @HISTORICAL_SNAPSHOT - users.name at change time
    actorIsAdmin: boolean('actor_is_admin'), // @HISTORICAL_SNAPSHOT - users.is_admin at change time
    actorRoleId: uuid('actor_role_id'), // @HISTORICAL_SNAPSHOT - users.role_id at change time
    actorDepartmentId: uuid('actor_department_id'), // @HISTORICAL_SNAPSHOT - users.department_id at change time
    // Request / grouping — filled when app writes
    operationId: uuid('operation_id'), // Same uuid for every row written in one business transaction
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    // Aggregate linkage — @HISTORICAL_SNAPSHOT of ownership at change time (both null or both set)
    parentTableName: text('parent_table_name'),
    parentRecordId: text('parent_record_id'),
    rootTableName: text('root_table_name'),
    rootRecordId: text('root_record_id'),
    createdAt,
  },
  (table) => [
    index('al_table_record_created_idx').on(table.tableName, table.recordId, table.createdAt),
    index('al_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('al_created_at_idx').on(table.createdAt),
    index('al_parent_created_idx').on(table.parentTableName, table.parentRecordId, table.createdAt),
    index('al_root_created_idx').on(table.rootTableName, table.rootRecordId, table.createdAt),
    index('al_operation_id_idx').on(table.operationId),
    check(
      'al_action_snapshots',
      sql`(
        (${table.action} = 'insert' AND ${table.oldRow} IS NULL AND ${table.newRow} IS NOT NULL AND ${table.changedColumns} IS NULL)
        OR (${table.action} = 'delete' AND ${table.oldRow} IS NOT NULL AND ${table.newRow} IS NULL AND ${table.changedColumns} IS NULL)
        OR (
          ${table.action} = 'update'
          AND ${table.oldRow} IS NOT NULL
          AND ${table.newRow} IS NOT NULL
          AND ${table.changedColumns} IS NOT NULL
          AND cardinality(${table.changedColumns}) > 0
        )
      )`,
    ),
    check(
      'al_parent_pair',
      sql`(${table.parentTableName} IS NULL) = (${table.parentRecordId} IS NULL)`,
    ),
    check(
      'al_root_pair',
      sql`(${table.rootTableName} IS NULL) = (${table.rootRecordId} IS NULL)`,
    ),
  ],
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));
