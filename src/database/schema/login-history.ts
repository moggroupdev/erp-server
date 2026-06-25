import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, numeric, index } from 'drizzle-orm/pg-core';
import { createdAt, loginStatusEnum } from './common';
import { users } from './users';

export const loginHistory = pgTable(
  'login_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    deviceId: varchar('device_id', { length: 255 }),
    locationCountry: varchar('location_country', { length: 100 }),
    locationCity: varchar('location_city', { length: 100 }),
    locationLat: numeric('location_lat', { precision: 10, scale: 8 }),
    locationLng: numeric('location_lng', { precision: 11, scale: 8 }),
    status: loginStatusEnum('status').notNull(),
    failureReason: text('failure_reason'),
    createdAt,
  },
  (table) => [
    index('login_history_user_id_idx').on(table.userId),
    index('login_history_status_idx').on(table.status),
    index('login_history_created_at_idx').on(table.createdAt),
  ],
);

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, {
    fields: [loginHistory.userId],
    references: [users.id],
  }),
}));
