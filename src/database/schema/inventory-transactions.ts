import { pgTable, uuid, text, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, inventoryTransactionTypeEnum, numeric, positiveQuantityCheck } from './common';
import { users } from './users';
import { materialPurchaseReceipts } from './purchasing-materials';
import { productionPlanItems } from './production-plans';
import { materials } from './materials';
import { maintenanceOrders } from './maintenance-orders';
import { outsourcingOrders, outsourcingReceipts } from './outsourcing';

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: IVT-00000001
    legacyNumber: text('legacy_number'), // Old system transaction number for seed/migration
    transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
    notes: text('notes'),
    // Sources - one source event per transaction; the source must match transaction_type (DB-checked below)
    materialPurchaseReceiptId: uuid('material_purchase_receipt_id'),
    maintenanceOrderId: uuid('maintenance_order_id'),
    outsourcingOrderId: uuid('outsourcing_order_id'), // Materials sent to the supplier for this order
    outsourcingReceiptId: uuid('outsourcing_receipt_id'),
    productionPlanItemId: uuid('production_plan_item_id'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'inv_tx_mpr_id_fk',
      columns: [table.materialPurchaseReceiptId],
      foreignColumns: [materialPurchaseReceipts.id],
    }),
    foreignKey({
      name: 'inv_tx_mo_id_fk',
      columns: [table.maintenanceOrderId],
      foreignColumns: [maintenanceOrders.id],
    }),
    foreignKey({
      name: 'inv_tx_oso_id_fk',
      columns: [table.outsourcingOrderId],
      foreignColumns: [outsourcingOrders.id],
    }),
    foreignKey({
      name: 'inv_tx_osr_id_fk',
      columns: [table.outsourcingReceiptId],
      foreignColumns: [outsourcingReceipts.id],
    }),
    foreignKey({
      name: 'inv_tx_pp_item_id_fk',
      columns: [table.productionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    index('inventory_transactions_legacy_number_idx').on(table.legacyNumber),
    index('inventory_transactions_transaction_type_idx').on(table.transactionType),
    index('inventory_transactions_created_at_idx').on(table.createdAt),
    index('inventory_transactions_created_by_idx').on(table.createdBy),
    index('inv_tx_mpr_id_idx').on(table.materialPurchaseReceiptId),
    index('inv_tx_mo_id_idx').on(table.maintenanceOrderId),
    index('inv_tx_oso_id_idx').on(table.outsourcingOrderId),
    index('inv_tx_osr_id_idx').on(table.outsourcingReceiptId),
    index('inv_tx_pp_item_id_idx').on(table.productionPlanItemId),
    check(
      'inv_tx_source_non_conflicting',
      // This check ensures that only one source is specified for the inventory transaction
      sql`num_nonnulls(${table.materialPurchaseReceiptId}, ${table.maintenanceOrderId}, ${table.outsourcingOrderId}, ${table.outsourcingReceiptId}, ${table.productionPlanItemId}) <= 1`,
    ),
    check(
      'inv_tx_receipt_source_type_match',
      sql`num_nonnulls(${table.materialPurchaseReceiptId}, ${table.outsourcingReceiptId}) = 0 OR ${table.transactionType} = 'receipt'`,
    ),
    check(
      'inv_tx_issue_source_type_match',
      sql`num_nonnulls(${table.maintenanceOrderId}, ${table.outsourcingOrderId}, ${table.productionPlanItemId}) = 0 OR ${table.transactionType} = 'issue'`,
    ),
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
  },
  (table) => [
    foreignKey({
      name: 'inv_tx_items_tx_id_fk',
      columns: [table.transactionId],
      foreignColumns: [inventoryTransactions.id],
    }),
    index('inv_tx_items_transaction_id_idx').on(table.transactionId),
    index('inv_tx_items_material_code_idx').on(table.materialCode),
    positiveQuantityCheck('inv_tx_items_quantity_positive', table.quantity),
    positiveQuantityCheck('inv_tx_items_unit_price_positive', table.unitPrice),
  ],
);

// ============================== RELATIONS ==============================

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
    relationName: 'inventoryTransactionCreatedBy',
  }),
  materialPurchaseReceipt: one(materialPurchaseReceipts, {
    fields: [inventoryTransactions.materialPurchaseReceiptId],
    references: [materialPurchaseReceipts.id],
  }),
  maintenanceOrder: one(maintenanceOrders, {
    fields: [inventoryTransactions.maintenanceOrderId],
    references: [maintenanceOrders.id],
  }),
  outsourcingOrder: one(outsourcingOrders, {
    fields: [inventoryTransactions.outsourcingOrderId],
    references: [outsourcingOrders.id],
  }),
  outsourcingReceipt: one(outsourcingReceipts, {
    fields: [inventoryTransactions.outsourcingReceiptId],
    references: [outsourcingReceipts.id],
  }),
  productionPlanItem: one(productionPlanItems, {
    fields: [inventoryTransactions.productionPlanItemId],
    references: [productionPlanItems.id],
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
}));
