import { pgTable, uuid, text, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, inventoryTransactionTypeEnum, numeric, positiveQuantityCheck } from './common';
import { users } from './users';
import { materialPurchaseReceiptItems } from './purchasing-materials';
import { productionPlanItems } from './production-plans';
import { materials } from './materials';
import { maintenanceOrderSpareParts } from './maintenance-orders';

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: IVT-00000001
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
    unitCost: numeric('unit_cost').notNull(), // @HISTORICAL_SNAPSHOT - User-provided actual cost at transaction time
    materialPurchaseReceiptItemId: uuid('material_purchase_receipt_item_id'), // @APP_CHECKED - Source must match parent transaction_type
    productionPlanItemId: uuid('production_plan_item_id'), // @APP_CHECKED - Source must match parent transaction_type
    maintenanceOrderSparePartId: uuid('maintenance_order_spare_part_id'), // @APP_CHECKED - Source must match parent transaction_type
  },
  (table) => [
    foreignKey({
      name: 'inv_tx_items_tx_id_fk',
      columns: [table.transactionId],
      foreignColumns: [inventoryTransactions.id],
    }),
    foreignKey({
      name: 'inv_tx_items_mpri_id_fk',
      columns: [table.materialPurchaseReceiptItemId],
      foreignColumns: [materialPurchaseReceiptItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_pp_item_id_fk',
      columns: [table.productionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_mosp_id_fk',
      columns: [table.maintenanceOrderSparePartId],
      foreignColumns: [maintenanceOrderSpareParts.id],
    }),
    index('inv_tx_items_transaction_id_idx').on(table.transactionId),
    index('inv_tx_items_material_code_idx').on(table.materialCode),
    index('inv_tx_items_mpri_id_idx').on(table.materialPurchaseReceiptItemId),
    index('inv_tx_items_pp_item_id_idx').on(table.productionPlanItemId),
    index('inv_tx_items_mosp_id_idx').on(table.maintenanceOrderSparePartId),
    positiveQuantityCheck('inv_tx_items_quantity_positive', table.quantity),
    positiveQuantityCheck('inv_tx_items_unit_cost_positive', table.unitCost),
    check(
      'inv_tx_items_source_non_conflicting',
      sql`(
        (${table.materialPurchaseReceiptItemId} IS NULL OR ${table.productionPlanItemId} IS NULL)
        AND (${table.materialPurchaseReceiptItemId} IS NULL OR ${table.maintenanceOrderSparePartId} IS NULL)
        AND (${table.productionPlanItemId} IS NULL OR ${table.maintenanceOrderSparePartId} IS NULL)
      )`,
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
  maintenanceOrderSparePart: one(maintenanceOrderSpareParts, {
    fields: [inventoryTransactionItems.maintenanceOrderSparePartId],
    references: [maintenanceOrderSpareParts.id],
  }),
}));
