import { pgTable, uuid, text, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { orderItems } from './orders';
import { materials } from './materials';

export const boms = pgTable(
  'boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityRequired: numeric('quantity_required').notNull(),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    unique('boms_order_item_material_unique').on(table.orderItemId, table.materialCode),
    index('boms_order_item_id_idx').on(table.orderItemId),
    index('boms_material_code_idx').on(table.materialCode),
    index('boms_created_by_idx').on(table.createdBy),
    nonNegativeQuantityCheck('boms_quantity_required_non_negative', table.quantityRequired),
  ],
);

export const bomsRelations = relations(boms, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [boms.orderItemId],
    references: [orderItems.id],
  }),
  material: one(materials, {
    fields: [boms.materialCode],
    references: [materials.code],
  }),
  createdBy: one(users, {
    fields: [boms.createdBy],
    references: [users.id],
  }),
}));
