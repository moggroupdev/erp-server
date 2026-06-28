import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users';

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => departments.id),
    managerId: uuid('manager_id').references((): AnyPgColumn => users.id),
  },
  (table) => [
    index('departments_name_en_idx').on(table.nameEn),
    index('departments_name_ar_idx').on(table.nameAr),
    index('departments_parent_id_idx').on(table.parentId),
    index('departments_manager_id_idx').on(table.managerId),
  ],
);

// ============================== RELATIONS ==============================

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: 'departmentParent',
  }),
  children: many(departments, {
    relationName: 'departmentParent',
  }),
  manager: one(users, {
    fields: [departments.managerId],
    references: [users.id],
    relationName: 'departmentManager',
  }),
  users: many(users, {
    relationName: 'userDepartment',
  }),
}));
