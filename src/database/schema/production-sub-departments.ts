import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { productionSubDepartmentEnum } from './common';
import { users } from './users';

export const productionSubDepartmentManagers = pgTable(
  'production_sub_department_managers',
  {
    subDepartment: productionSubDepartmentEnum('sub_department').primaryKey(),
    managerId: uuid('manager_id'),
    deputyManagerId: uuid('deputy_manager_id'),
  },
  (table) => [
    foreignKey({
      name: 'psdm_manager_id_fk',
      columns: [table.managerId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'psdm_deputy_manager_id_fk',
      columns: [table.deputyManagerId],
      foreignColumns: [users.id],
    }),
    index('psdm_manager_id_idx').on(table.managerId),
    index('psdm_deputy_manager_id_idx').on(table.deputyManagerId),
    check(
      'psdm_manager_deputy_distinct',
      sql`${table.managerId} IS NULL OR ${table.deputyManagerId} IS NULL OR ${table.managerId} <> ${table.deputyManagerId}`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const productionSubDepartmentManagersRelations = relations(productionSubDepartmentManagers, ({ one }) => ({
  manager: one(users, {
    fields: [productionSubDepartmentManagers.managerId],
    references: [users.id],
    relationName: 'productionSubDepartmentManager',
  }),
  deputyManager: one(users, {
    fields: [productionSubDepartmentManagers.deputyManagerId],
    references: [users.id],
    relationName: 'productionSubDepartmentDeputyManager',
  }),
}));
