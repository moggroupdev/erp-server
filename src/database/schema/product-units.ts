import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { users } from './users';
import { contractItems } from './contracts';
import { productionPlanItems } from './production-plans';
import { boms } from './boms';
import { deliveryItems } from './deliveries';
import { installationItems } from './installations';
import { productPurchaseReceiptItems } from './purchasing-products';

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
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }), // Set when parent contract item is cancelled/replaced, or unit is dropped on quantity decrease
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('product_units_contract_item_id_idx').on(table.contractItemId),
    index('product_units_created_at_idx').on(table.createdAt),
    index('product_units_produced_at_idx').on(table.producedAt),
    index('product_units_received_at_idx').on(table.receivedAt),
    index('product_units_delivered_at_idx').on(table.deliveredAt),
    index('product_units_installed_at_idx').on(table.installedAt),
    index('product_units_cancelled_at_idx').on(table.cancelledAt),
  ],
);

// ============================== RELATIONS ==============================

export const productUnitsRelations = relations(productUnits, ({ one, many }) => ({
  contractItem: one(contractItems, {
    fields: [productUnits.contractItemId],
    references: [contractItems.id],
  }),
  productionPlanItems: many(productionPlanItems),
  boms: many(boms),
  deliveryItem: one(deliveryItems, {
    fields: [productUnits.id],
    references: [deliveryItems.productUnitId],
  }),
  installationItem: one(installationItems, {
    fields: [productUnits.id],
    references: [installationItems.productUnitId],
  }),
  purchaseReceiptItem: one(productPurchaseReceiptItems, {
    fields: [productUnits.id],
    references: [productPurchaseReceiptItems.productUnitId],
  }),
  createdBy: one(users, {
    fields: [productUnits.createdBy],
    references: [users.id],
  }),
}));
