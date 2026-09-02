import { timestamp } from 'drizzle-orm/pg-core';

export const deletedAt = timestamp('deleted_at', { withTimezone: true });
export const blacklistedAt = timestamp('blacklisted_at', { withTimezone: true });
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
