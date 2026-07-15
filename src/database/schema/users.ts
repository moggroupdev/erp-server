import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, check, primaryKey, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, percentage, permissionEnum, productionSubDepartmentEnum } from './common';
import { loginHistory } from './login-history';
import { departments } from './departments';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: USR-00000001
    name: text('name').notNull(),
    phone: text('phone').unique(),
    isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
    email: text('email').unique(),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    password: text('password').notNull(), // Store hashed password
    isAdmin: boolean('is_admin').notNull().default(false),
    roleId: uuid('role_id').references(() => roles.id),
    departmentId: uuid('department_id').references(() => departments.id),
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department'), // @APP_CHECKED - Required only when department_id is Production
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id), // Self-referencing foreign key
    createdAt,
    deletedAt,
  },
  (table) => [
    index('users_name_idx').on(table.name),
    index('users_role_id_idx').on(table.roleId),
    index('users_department_id_idx').on(table.departmentId),
    index('users_production_sub_department_idx').on(table.productionSubDepartment),
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
    maxDiscountPct: percentage('max_discount_pct'), // @APP_CHECKED - NULL = no discount allowed; non-null = max percentage cap
    departmentId: uuid('department_id').references(() => departments.id), // @APP_CHECKED - Optional department scope; must match user's department when assigning role
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
  },
  (table) => [
    index('roles_created_by_idx').on(table.createdBy),
    index('roles_department_id_idx').on(table.departmentId),
    check(
      'roles_max_discount_pct_check',
      sql`${table.maxDiscountPct} IS NULL OR (${table.maxDiscountPct} >= 0 AND ${table.maxDiscountPct} <= 100)`,
    ),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permission: permissionEnum('permission').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] }), index('permissions_role_id_idx').on(table.roleId)],
);

// ============================== RELATIONS ==============================

export const usersRelations = relations(users, ({ one, many }) => ({
  createdBy: one(users, {
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
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
    relationName: 'userDepartment',
  }),
  loginHistory: many(loginHistory),
  createdRoles: many(roles, { relationName: 'roleCreatedBy' }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [roles.createdBy],
    references: [users.id],
    relationName: 'roleCreatedBy',
  }),
  department: one(departments, {
    fields: [roles.departmentId],
    references: [departments.id],
    relationName: 'roleDepartment',
  }),
  permissions: many(permissions),
  users: many(users, { relationName: 'userRole' }),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, {
    fields: [permissions.roleId],
    references: [roles.id],
  }),
}));
