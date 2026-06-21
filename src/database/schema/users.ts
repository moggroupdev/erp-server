import { pgTable, uuid, text, boolean, check, primaryKey, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, deletedAt, permissionEnum } from './common';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    phone: text('phone').unique(),
    isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
    email: text('email').unique(),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    password: text('password'), // Store hashed password
    isAdmin: boolean('is_admin').notNull().default(false),
    roleId: uuid('role_id').references(() => roles.id),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id), // Self-referencing foreign key
    createdAt,
    deletedAt,
  },
  (table) => [
    index('users_role_id_idx').on(table.roleId),
    index('users_created_by_idx').on(table.createdBy),
    index('users_name_idx').on(table.name),
    check(
      'users_admin_or_role_check',
      sql`(${table.isAdmin} = true AND ${table.roleId} IS NULL) OR (${table.isAdmin} = false AND ${table.roleId} IS NOT NULL)`,
    ),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
  },
  (table) => [index('roles_created_by_idx').on(table.createdBy)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permission: permissionEnum('permission').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permission] }),
    index('role_permissions_role_id_idx').on(table.roleId),
  ],
);

// ============================== RELATIONS ==============================

export const usersRelations = relations(users, ({ one, many }) => ({
  creator: one(users, {
    fields: [users.createdBy],
    references: [users.id],
    relationName: 'userCreatedBy',
  }),
  createdUsers: many(users, {
    relationName: 'userCreatedBy',
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
    relationName: 'userRole',
  }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [roles.createdBy],
    references: [users.id],
    relationName: 'roleCreatedBy',
  }),
  permissions: many(rolePermissions),
  users: many(users, { relationName: 'userRole' }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
}));
