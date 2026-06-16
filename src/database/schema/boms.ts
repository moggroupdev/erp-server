import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
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
  (table) => [nonNegativeQuantityCheck('boms_quantity_required_non_negative', table.quantityRequired)],
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
