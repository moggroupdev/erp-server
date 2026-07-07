import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { users } from './users';
import { contractItems } from './contracts';
import { productionPlanItems } from './production-plans';
import { deliveryItems } from './deliveries';
import { installationItems } from './installations';
import { customerReceptionItems } from './customer-receptions';
import { productPurchaseReceiptItems } from './purchasing-products';
import { maintenanceOrderItems } from './maintenance-orders';

export const productUnits = pgTable(
  'product_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serialNumber: text('serial_number').notNull().unique(),
    vendorSerialNumber: text('vendor_serial_number').unique(), // For the imported products
    contractItemId: uuid('contract_item_id')
      .notNull()
      .references(() => contractItems.id),
    // @CACHING_APP_SYNCED - Unit lifecycle timestamps derived from workflow child tables
    producedAt: timestamp('produced_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Set when the last production_plan_items row for this unit has completed_at
    receivedAt: timestamp('received_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Derived from product_purchase_receipt_items when parent receipt received_at is set
    deliveredAt: timestamp('delivered_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Derived from deliveries.completed_at via delivery_items
    installedAt: timestamp('installed_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Derived from installations.completed_at via installation_items
    warrantyStartedAt: timestamp('warranty_started_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Derived from customer_receptions.received_at via customer_reception_items
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Set when parent contract_item is cancelled/replaced, or unit dropped on quantity decrease
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
    index('product_units_warranty_started_at_idx').on(table.warrantyStartedAt),
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
  deliveryItem: one(deliveryItems, {
    fields: [productUnits.id],
    references: [deliveryItems.productUnitId],
  }),
  installationItem: one(installationItems, {
    fields: [productUnits.id],
    references: [installationItems.productUnitId],
  }),
  customerReceptionItem: one(customerReceptionItems, {
    fields: [productUnits.id],
    references: [customerReceptionItems.productUnitId],
  }),
  purchaseReceiptItem: one(productPurchaseReceiptItems, {
    fields: [productUnits.id],
    references: [productPurchaseReceiptItems.productUnitId],
  }),
  maintenanceOrderItems: many(maintenanceOrderItems),
  createdBy: one(users, {
    fields: [productUnits.createdBy],
    references: [users.id],
  }),
}));
