import { pgTable, uuid, text, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, inventoryTransactionTypeEnum, numeric, positiveQuantityCheck } from './common';
import { users } from './users';
import { materialPurchaseReceiptItems } from './purchasing-materials';
import { productionPlanItems } from './production-plans';
import { materials } from './materials';
import { maintenanceOrderMaterials } from './maintenance-orders';
import { outsourcingOrderItems, outsourcingReceiptItems } from './outsourcing';

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: IVT-00000001
    legacyNumber: text('legacy_number').unique(), // Old system transaction number for seed/migration
    transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('inventory_transactions_transaction_type_idx').on(table.transactionType),
    index('inventory_transactions_created_at_idx').on(table.createdAt),
    index('inventory_transactions_created_by_idx').on(table.createdBy),
  ],
);

export const inventoryTransactionItems = pgTable(
  'inventory_transaction_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantity: numeric('quantity').notNull(),
    unitPrice: numeric('unit_price').notNull(), // @HISTORICAL_SNAPSHOT - User-provided actual price at transaction time
    productionPlanItemId: uuid('production_plan_item_id'), // @APP_CHECKED - Source must match parent transaction_type ('issue')
    maintenanceOrderMaterialId: uuid('maintenance_order_material_id'), // @APP_CHECKED - Source must match parent transaction_type ('issue')
    outsourcingOrderItemId: uuid('outsourcing_order_item_id'), // @APP_CHECKED - Source must match parent transaction_type ('issue'); materials sent to the vendor for this order line
    outsourcingReceiptItemId: uuid('outsourcing_receipt_item_id'), // @APP_CHECKED - Source must match parent transaction_type ('receipt')
    materialPurchaseReceiptItemId: uuid('material_purchase_receipt_item_id'), // @APP_CHECKED - Source must match parent transaction_type ('receipt')
  },
  (table) => [
    foreignKey({
      name: 'inv_tx_items_tx_id_fk',
      columns: [table.transactionId],
      foreignColumns: [inventoryTransactions.id],
    }),

    foreignKey({
      name: 'inv_tx_items_pp_item_id_fk',
      columns: [table.productionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_mom_id_fk',
      columns: [table.maintenanceOrderMaterialId],
      foreignColumns: [maintenanceOrderMaterials.id],
    }),
    foreignKey({
      name: 'inv_tx_items_osoi_id_fk',
      columns: [table.outsourcingOrderItemId],
      foreignColumns: [outsourcingOrderItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_osri_id_fk',
      columns: [table.outsourcingReceiptItemId],
      foreignColumns: [outsourcingReceiptItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_mpri_id_fk',
      columns: [table.materialPurchaseReceiptItemId],
      foreignColumns: [materialPurchaseReceiptItems.id],
    }),
    index('inv_tx_items_transaction_id_idx').on(table.transactionId),
    index('inv_tx_items_material_code_idx').on(table.materialCode),
    index('inv_tx_items_pp_item_id_idx').on(table.productionPlanItemId),
    index('inv_tx_items_mom_id_idx').on(table.maintenanceOrderMaterialId),
    index('inv_tx_items_osoi_id_idx').on(table.outsourcingOrderItemId),
    index('inv_tx_items_osri_id_idx').on(table.outsourcingReceiptItemId),
    index('inv_tx_items_mpri_id_idx').on(table.materialPurchaseReceiptItemId),
    positiveQuantityCheck('inv_tx_items_quantity_positive', table.quantity),
    positiveQuantityCheck('inv_tx_items_unit_price_positive', table.unitPrice),
    check(
      'inv_tx_items_source_non_conflicting',
      // This check ensures that only one source is specified for the inventory transaction item
      sql`num_nonnulls(${table.materialPurchaseReceiptItemId}, ${table.productionPlanItemId}, ${table.maintenanceOrderMaterialId}, ${table.outsourcingOrderItemId}, ${table.outsourcingReceiptItemId}) <= 1`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
    relationName: 'inventoryTransactionCreatedBy',
  }),
  items: many(inventoryTransactionItems),
}));

export const inventoryTransactionItemsRelations = relations(inventoryTransactionItems, ({ one }) => ({
  transaction: one(inventoryTransactions, {
    fields: [inventoryTransactionItems.transactionId],
    references: [inventoryTransactions.id],
  }),
  material: one(materials, {
    fields: [inventoryTransactionItems.materialCode],
    references: [materials.code],
  }),
  materialPurchaseReceiptItem: one(materialPurchaseReceiptItems, {
    fields: [inventoryTransactionItems.materialPurchaseReceiptItemId],
    references: [materialPurchaseReceiptItems.id],
  }),
  productionPlanItem: one(productionPlanItems, {
    fields: [inventoryTransactionItems.productionPlanItemId],
    references: [productionPlanItems.id],
  }),
  maintenanceOrderMaterial: one(maintenanceOrderMaterials, {
    fields: [inventoryTransactionItems.maintenanceOrderMaterialId],
    references: [maintenanceOrderMaterials.id],
  }),
  outsourcingOrderItem: one(outsourcingOrderItems, {
    fields: [inventoryTransactionItems.outsourcingOrderItemId],
    references: [outsourcingOrderItems.id],
  }),
  outsourcingReceiptItem: one(outsourcingReceiptItems, {
    fields: [inventoryTransactionItems.outsourcingReceiptItemId],
    references: [outsourcingReceiptItems.id],
  }),
}));
