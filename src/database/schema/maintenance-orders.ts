import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { createdAt, maintenanceTypeEnum, maintenanceServiceLocationEnum, numeric, positiveQuantityCheck } from './common';
import { customers, customerAddresses } from './customers';
import { serviceAgreements } from './service-agreements';
import { productUnits } from './product-units';
import { materials } from './materials';
import { users } from './users';
import { inventoryTransactionItems } from './inventory-transactions';
import { trips } from './trips';

export const maintenanceOrders = pgTable(
  'maintenance_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MNT-00000001
    maintenanceType: maintenanceTypeEnum('maintenance_type').notNull(),
    serviceAgreementId: uuid('service_agreement_id'),
    serviceLocation: maintenanceServiceLocationEnum('service_location').notNull(),
    customerAddressId: uuid('customer_address_id').references(() => customerAddresses.id),
    customerId: uuid('customer_id') // RFP
      .notNull()
      .references(() => customers.id),
    tripId: uuid('trip_id').references(() => trips.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'mo_service_agreement_id_fk',
      columns: [table.serviceAgreementId],
      foreignColumns: [serviceAgreements.id],
    }),
    index('maintenance_orders_code_idx').on(table.code),
    index('maintenance_orders_customer_id_idx').on(table.customerId),
    index('maintenance_orders_service_agreement_id_idx').on(table.serviceAgreementId),
    index('maintenance_orders_trip_id_idx').on(table.tripId),
    check(
      'maintenance_orders_service_agreement_required',
      sql`${table.maintenanceType} <> 'service_contract' OR ${table.serviceAgreementId} IS NOT NULL`,
    ),
    check(
      'maintenance_orders_customer_address_null_service_contract',
      sql`${table.maintenanceType} <> 'service_contract' OR ${table.customerAddressId} IS NULL`,
    ),
    check(
      'maintenance_orders_completed_cancelled_exclusive',
      sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`,
    ),
    check(
      'maintenance_orders_completed_at_gte_scheduled_at',
      sql`${table.completedAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.completedAt} >= ${table.scheduledAt}`,
    ),
  ],
);

export const maintenanceOrderItems = pgTable(
  'maintenance_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    maintenanceOrderId: uuid('maintenance_order_id').notNull(),
    productUnitId: uuid('product_unit_id') // app-checked — unit must be in-warranty (warranty_started_at set, not expired) when parent maintenance_type = 'in_warranty'
      .notNull()
      .references(() => productUnits.id),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'moi_mo_id_fk',
      columns: [table.maintenanceOrderId],
      foreignColumns: [maintenanceOrders.id],
    }),
    index('maintenance_order_items_maintenance_order_id_idx').on(table.maintenanceOrderId),
    index('maintenance_order_items_product_unit_id_idx').on(table.productUnitId),
  ],
);

export const maintenanceOrderSpareParts = pgTable(
  'maintenance_order_spare_parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    maintenanceOrderId: uuid('maintenance_order_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantity: numeric('quantity').notNull(),
    unitPrice: numeric('unit_price').notNull(), // Selling price snapshot at time of use
    isBillable: boolean('is_billable').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'mosp_mo_id_fk',
      columns: [table.maintenanceOrderId],
      foreignColumns: [maintenanceOrders.id],
    }),
    index('maintenance_order_spare_parts_maintenance_order_id_idx').on(table.maintenanceOrderId),
    index('maintenance_order_spare_parts_material_code_idx').on(table.materialCode),
    positiveQuantityCheck('maintenance_order_spare_parts_quantity_positive', table.quantity),
    positiveQuantityCheck('maintenance_order_spare_parts_unit_price_positive', table.unitPrice),
  ],
);

// ============================== RELATIONS ==============================

export const maintenanceOrdersRelations = relations(maintenanceOrders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [maintenanceOrders.customerId],
    references: [customers.id],
  }),
  serviceAgreement: one(serviceAgreements, {
    fields: [maintenanceOrders.serviceAgreementId],
    references: [serviceAgreements.id],
  }),
  customerAddress: one(customerAddresses, {
    fields: [maintenanceOrders.customerAddressId],
    references: [customerAddresses.id],
  }),
  trip: one(trips, {
    fields: [maintenanceOrders.tripId],
    references: [trips.id],
  }),
  assignedTo: one(users, {
    fields: [maintenanceOrders.assignedTo],
    references: [users.id],
    relationName: 'maintenanceOrderAssignedTo',
  }),
  createdBy: one(users, {
    fields: [maintenanceOrders.createdBy],
    references: [users.id],
    relationName: 'maintenanceOrderCreatedBy',
  }),
  items: many(maintenanceOrderItems),
  spareParts: many(maintenanceOrderSpareParts),
}));

export const maintenanceOrderItemsRelations = relations(maintenanceOrderItems, ({ one }) => ({
  maintenanceOrder: one(maintenanceOrders, {
    fields: [maintenanceOrderItems.maintenanceOrderId],
    references: [maintenanceOrders.id],
  }),
  productUnit: one(productUnits, {
    fields: [maintenanceOrderItems.productUnitId],
    references: [productUnits.id],
  }),
}));

export const maintenanceOrderSparePartsRelations = relations(maintenanceOrderSpareParts, ({ one, many }) => ({
  maintenanceOrder: one(maintenanceOrders, {
    fields: [maintenanceOrderSpareParts.maintenanceOrderId],
    references: [maintenanceOrders.id],
  }),
  material: one(materials, {
    fields: [maintenanceOrderSpareParts.materialCode],
    references: [materials.code],
  }),
  inventoryTransactionItems: many(inventoryTransactionItems),
}));
