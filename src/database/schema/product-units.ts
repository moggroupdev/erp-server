import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { users } from './users';
import { contractItems } from './contracts';
import { productionPlanItems } from './production-plans';

export const productUnits = pgTable(
  'product_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serialNumber: text('serial_number').notNull().unique(),
    vendorSerialNumber: text('vendor_serial_number').unique(), // For the imported products
    contractItemId: uuid('contract_item_id')
      .notNull()
      .references(() => contractItems.id),
    // Status can be deduced from the following timestamps. The following timestamps are app-synced (which means they are derived from other tables)
    producedAt: timestamp('produced_at', { withTimezone: true }), // app-synced
    receivedAt: timestamp('received_at', { withTimezone: true }), // app-synced
    deliveredAt: timestamp('delivered_at', { withTimezone: true }), // app-synced
    installedAt: timestamp('installed_at', { withTimezone: true }), // app-synced
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('product_units_contract_item_id_idx').on(table.contractItemId),
    index('product_units_created_at_idx').on(table.createdAt),
  ],
);

// ============================== RELATIONS ==============================

export const productUnitsRelations = relations(productUnits, ({ one, many }) => ({
  contractItem: one(contractItems, {
    fields: [productUnits.contractItemId],
    references: [contractItems.id],
  }),
  productionPlanItems: many(productionPlanItems),
  createdBy: one(users, {
    fields: [productUnits.createdBy],
    references: [users.id],
  }),
}));
