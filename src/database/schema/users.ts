import { pgTable, uuid, text, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt } from './common';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').unique(),
  isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
  email: text('email').unique(),
  isEmailVerified: boolean('is_email_verified').notNull().default(false),
  password: text('password'), // Store hashed password
  createdBy: uuid('created_by').references(() => users.id),
  createdAt,
});

export const usersRelations = relations(users, ({ one }) => ({
  createdBy: one(users, {
    fields: [users.createdBy],
    references: [users.id],
  }),
}));
