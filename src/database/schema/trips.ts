import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { users } from './users';
import { deliveries } from './deliveries';
import { installations } from './installations';
import { maintenanceOrders } from './maintenance-orders';

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: TRP-00000001
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('trips_code_idx').on(table.code),
    index('trips_scheduled_at_idx').on(table.scheduledAt),
    index('trips_cancelled_at_idx').on(table.cancelledAt),
    check(
      'trips_cancelled_at_gte_scheduled_at',
      sql`${table.cancelledAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.cancelledAt} >= ${table.scheduledAt}`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const tripsRelations = relations(trips, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [trips.createdBy],
    references: [users.id],
    relationName: 'tripCreatedBy',
  }),
  deliveries: many(deliveries),
  installations: many(installations),
  maintenanceOrders: many(maintenanceOrders),
}));
