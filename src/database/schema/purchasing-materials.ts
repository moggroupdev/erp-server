import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check, unique } from 'drizzle-orm/pg-core';
import {
  createdAt,
  numeric,
  nonNegativeQuantityCheck,
  nonNegativeNullableQuantityCheck,
  positiveQuantityCheck,
  positiveNullableQuantityCheck,
  productionSubDepartmentEnum,
} from './common';
import { users } from './users';
import { suppliers } from './suppliers';
import { materials } from './materials';
import { contractItems } from './contracts';
import { inventoryTransactions } from './inventory-transactions';

export const materialPurchaseRequisitions = pgTable(
  'material_purchase_requisitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MPQ-00000001
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department').notNull(),
    productionSubDepartmentManagerId: uuid('production_sub_department_manager_id'), // @HISTORICAL_SNAPSHOT - Manager at requisition create / sub-dept change; live assignment may change later
    notes: text('notes'),
    planningApprovedAt: timestamp('planning_approved_at', { withTimezone: true }),
    planningApprovedBy: uuid('planning_approved_by'),
    purchasingManagerApprovedAt: timestamp('purchasing_manager_approved_at', { withTimezone: true }),
    purchasingManagerApprovedBy: uuid('purchasing_manager_approved_by'),
    directorApprovedAt: timestamp('director_approved_at', { withTimezone: true }),
    directorApprovedBy: uuid('director_approved_by'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by'),
    rejectionReason: text('rejection_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'mprq_psd_manager_id_fk',
      columns: [table.productionSubDepartmentManagerId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'mprq_planning_approved_by_fk',
      columns: [table.planningApprovedBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'mprq_purchasing_manager_approved_by_fk',
      columns: [table.purchasingManagerApprovedBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'mprq_director_approved_by_fk',
      columns: [table.directorApprovedBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'mprq_rejected_by_fk',
      columns: [table.rejectedBy],
      foreignColumns: [users.id],
    }),
    index('mprq_production_sub_department_idx').on(table.productionSubDepartment),
    index('mprq_psd_manager_id_idx').on(table.productionSubDepartmentManagerId),
    index('mprq_planning_approved_at_idx').on(table.planningApprovedAt),
    index('mprq_purchasing_manager_approved_at_idx').on(table.purchasingManagerApprovedAt),
    index('mprq_director_approved_at_idx').on(table.directorApprovedAt),
    index('mprq_rejected_at_idx').on(table.rejectedAt),
    index('mprq_cancelled_at_idx').on(table.cancelledAt),
    index('mprq_created_at_idx').on(table.createdAt),
    index('mprq_created_by_idx').on(table.createdBy),
    index('mprq_planning_approved_by_idx').on(table.planningApprovedBy),
    index('mprq_purchasing_manager_approved_by_idx').on(table.purchasingManagerApprovedBy),
    index('mprq_director_approved_by_idx').on(table.directorApprovedBy),
    index('mprq_rejected_by_idx').on(table.rejectedBy),
    check('mprq_planning_approval_pair', sql`(${table.planningApprovedAt} IS NULL) = (${table.planningApprovedBy} IS NULL)`),
    check(
      'mprq_purchasing_manager_approval_pair',
      sql`(${table.purchasingManagerApprovedAt} IS NULL) = (${table.purchasingManagerApprovedBy} IS NULL)`,
    ),
    check('mprq_director_approval_pair', sql`(${table.directorApprovedAt} IS NULL) = (${table.directorApprovedBy} IS NULL)`),
    check('mprq_rejection_pair', sql`(${table.rejectedAt} IS NULL) = (${table.rejectedBy} IS NULL)`),
    check('mprq_rejection_reason_required', sql`(${table.rejectedAt} IS NULL) = (${table.rejectionReason} IS NULL)`),
    check('mprq_cancelled_rejected_exclusive', sql`${table.cancelledAt} IS NULL OR ${table.rejectedAt} IS NULL`),
  ],
);

export const materialPurchaseRequisitionItems = pgTable(
  'material_purchase_requisition_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseRequisitionId: uuid('material_purchase_requisition_id').notNull(),
    materialCode: text('material_code').notNull(),
    quantityRequested: numeric('quantity_requested').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'mprqi_mprq_id_fk',
      columns: [table.materialPurchaseRequisitionId],
      foreignColumns: [materialPurchaseRequisitions.id],
    }),
    foreignKey({
      name: 'mprqi_material_code_fk',
      columns: [table.materialCode],
      foreignColumns: [materials.code],
    }),
    index('mprqi_mprq_id_idx').on(table.materialPurchaseRequisitionId),
    index('mprqi_material_code_idx').on(table.materialCode),
    unique('mprqi_mprq_material_unique').on(table.materialPurchaseRequisitionId, table.materialCode),
    positiveQuantityCheck('mprqi_quantity_requested_positive', table.quantityRequested),
  ],
);

export const materialPurchaseOrders = pgTable(
  'material_purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MPO-00000001
    invoiceNumber: text('invoice_number'),
    invoiceIssuedAt: timestamp('invoice_issued_at', { withTimezone: true }),
    invoiceTotalPurchases: numeric('invoice_total_purchases'),
    invoiceTotalDiscount: numeric('invoice_total_discount'),
    invoiceVatAmount: numeric('invoice_vat_amount'),
    invoiceWithholdingTaxAmount: numeric('invoice_withholding_tax_amount'),
    invoiceTotalAmount: numeric('invoice_total_amount'),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    totalAmount: numeric('total_amount').notNull(), // @CACHING_APP_SYNCED - SUM(quantity_ordered * unit_price) from material_purchase_order_items
    completedAt: timestamp('completed_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Set when all order lines are fully received across all receipts
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('mpo_supplier_id_idx').on(table.supplierId),
    index('mpo_completed_at_idx').on(table.completedAt),
    index('mpo_cancelled_at_idx').on(table.cancelledAt),
    index('mpo_created_at_idx').on(table.createdAt),
    index('mpo_created_by_idx').on(table.createdBy),
    check('mpo_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    nonNegativeQuantityCheck('mpo_total_amount_non_negative', table.totalAmount),
    nonNegativeNullableQuantityCheck('mpo_invoice_total_purchases_non_negative', table.invoiceTotalPurchases),
    nonNegativeNullableQuantityCheck('mpo_invoice_total_discount_non_negative', table.invoiceTotalDiscount),
    nonNegativeNullableQuantityCheck('mpo_invoice_vat_amount_non_negative', table.invoiceVatAmount),
    nonNegativeNullableQuantityCheck(
      'mpo_invoice_withholding_tax_amount_non_negative',
      table.invoiceWithholdingTaxAmount,
    ),
    nonNegativeNullableQuantityCheck('mpo_invoice_total_amount_non_negative', table.invoiceTotalAmount),
  ],
);

export const materialPurchaseOrderItems = pgTable(
  'material_purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseOrderId: uuid('material_purchase_order_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityOrdered: numeric('quantity_ordered').notNull(),
    unitPrice: numeric('unit_price').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'mpoi_mpo_id_fk',
      columns: [table.materialPurchaseOrderId],
      foreignColumns: [materialPurchaseOrders.id],
    }),
    index('mpoi_mpo_id_idx').on(table.materialPurchaseOrderId),
    index('mpoi_material_code_idx').on(table.materialCode),
    unique('mpoi_mpo_material_unique').on(table.materialPurchaseOrderId, table.materialCode),
    positiveQuantityCheck('mpoi_quantity_ordered_positive', table.quantityOrdered),
    positiveQuantityCheck('mpoi_unit_price_positive', table.unitPrice),
  ],
);

export const materialPurchaseOrderItemContractItems = pgTable(
  'material_purchase_order_item_contract_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseOrderItemId: uuid('material_purchase_order_item_id').notNull(),
    contractItemId: uuid('contract_item_id').notNull(),
    quantityAllocated: numeric('quantity_allocated'), // Optional — informational only, not validated against quantity_ordered
  },
  (table) => [
    foreignKey({
      name: 'mpoici_mpoi_id_fk',
      columns: [table.materialPurchaseOrderItemId],
      foreignColumns: [materialPurchaseOrderItems.id],
    }),
    foreignKey({
      name: 'mpoici_contract_item_id_fk',
      columns: [table.contractItemId],
      foreignColumns: [contractItems.id],
    }),
    index('mpoici_mpoi_id_idx').on(table.materialPurchaseOrderItemId),
    index('mpoici_contract_item_id_idx').on(table.contractItemId),
    unique('mpoici_mpoi_contract_item_unique').on(table.materialPurchaseOrderItemId, table.contractItemId),
    positiveNullableQuantityCheck('mpoici_quantity_allocated_positive', table.quantityAllocated),
  ],
);

// Links MPO lines to requisition lines; qty required (unlike optional contract allocations).
export const materialPurchaseOrderItemRequisitionItems = pgTable(
  'material_purchase_order_item_requisition_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseOrderItemId: uuid('material_purchase_order_item_id').notNull(),
    materialPurchaseRequisitionItemId: uuid('material_purchase_requisition_item_id').notNull(), // @APP_CHECKED - parent requisition must be fully approved; qty caps enforced in app
    quantityAllocated: numeric('quantity_allocated').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'mpoirqi_mpoi_id_fk',
      columns: [table.materialPurchaseOrderItemId],
      foreignColumns: [materialPurchaseOrderItems.id],
    }),
    foreignKey({
      name: 'mpoirqi_mprqi_id_fk',
      columns: [table.materialPurchaseRequisitionItemId],
      foreignColumns: [materialPurchaseRequisitionItems.id],
    }),
    index('mpoirqi_mpoi_id_idx').on(table.materialPurchaseOrderItemId),
    index('mpoirqi_mprqi_id_idx').on(table.materialPurchaseRequisitionItemId),
    unique('mpoirqi_mpoi_mprqi_unique').on(table.materialPurchaseOrderItemId, table.materialPurchaseRequisitionItemId),
    positiveQuantityCheck('mpoirqi_quantity_allocated_positive', table.quantityAllocated),
  ],
);

export const materialPurchaseReceipts = pgTable(
  'material_purchase_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MPR-00000001
    materialPurchaseOrderId: uuid('material_purchase_order_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'mpr_mpo_id_fk',
      columns: [table.materialPurchaseOrderId],
      foreignColumns: [materialPurchaseOrders.id],
    }),
    index('mpr_mpo_id_idx').on(table.materialPurchaseOrderId),
    index('mpr_received_at_idx').on(table.receivedAt),
    index('mpr_received_by_idx').on(table.receivedBy),
    index('mpr_created_by_idx').on(table.createdBy),
    index('mpr_created_at_idx').on(table.createdAt),
  ],
);

export const materialPurchaseReceiptItems = pgTable(
  'material_purchase_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseReceiptId: uuid('material_purchase_receipt_id').notNull(),
    materialPurchaseOrderItemId: uuid('material_purchase_order_item_id').notNull(),
    quantityReceived: numeric('quantity_received').notNull(),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    foreignKey({
      name: 'mpri_receipt_id_fk',
      columns: [table.materialPurchaseReceiptId],
      foreignColumns: [materialPurchaseReceipts.id],
    }),
    foreignKey({
      name: 'mpri_mpoi_id_fk',
      columns: [table.materialPurchaseOrderItemId],
      foreignColumns: [materialPurchaseOrderItems.id],
    }),
    index('mpri_receipt_id_idx').on(table.materialPurchaseReceiptId),
    index('mpri_mpoi_id_idx').on(table.materialPurchaseOrderItemId),
    unique('mpri_receipt_mpoi_unique').on(table.materialPurchaseReceiptId, table.materialPurchaseOrderItemId),
    nonNegativeQuantityCheck('mpri_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('mpri_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

// ============================== RELATIONS ==============================

export const materialPurchaseRequisitionsRelations = relations(materialPurchaseRequisitions, ({ one, many }) => ({
  productionSubDepartmentManager: one(users, {
    fields: [materialPurchaseRequisitions.productionSubDepartmentManagerId],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionProductionSubDepartmentManager',
  }),
  createdBy: one(users, {
    fields: [materialPurchaseRequisitions.createdBy],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionCreatedBy',
  }),
  planningApprovedBy: one(users, {
    fields: [materialPurchaseRequisitions.planningApprovedBy],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionPlanningApprovedBy',
  }),
  purchasingManagerApprovedBy: one(users, {
    fields: [materialPurchaseRequisitions.purchasingManagerApprovedBy],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionPurchasingManagerApprovedBy',
  }),
  directorApprovedBy: one(users, {
    fields: [materialPurchaseRequisitions.directorApprovedBy],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionDirectorApprovedBy',
  }),
  rejectedBy: one(users, {
    fields: [materialPurchaseRequisitions.rejectedBy],
    references: [users.id],
    relationName: 'materialPurchaseRequisitionRejectedBy',
  }),
  items: many(materialPurchaseRequisitionItems),
}));

export const materialPurchaseRequisitionItemsRelations = relations(materialPurchaseRequisitionItems, ({ one, many }) => ({
  materialPurchaseRequisition: one(materialPurchaseRequisitions, {
    fields: [materialPurchaseRequisitionItems.materialPurchaseRequisitionId],
    references: [materialPurchaseRequisitions.id],
  }),
  material: one(materials, {
    fields: [materialPurchaseRequisitionItems.materialCode],
    references: [materials.code],
  }),
  orderItemAllocations: many(materialPurchaseOrderItemRequisitionItems),
}));

export const materialPurchaseOrdersRelations = relations(materialPurchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [materialPurchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [materialPurchaseOrders.createdBy],
    references: [users.id],
    relationName: 'materialPurchaseOrderCreatedBy',
  }),
  items: many(materialPurchaseOrderItems),
  receipts: many(materialPurchaseReceipts),
}));

export const materialPurchaseOrderItemsRelations = relations(materialPurchaseOrderItems, ({ one, many }) => ({
  materialPurchaseOrder: one(materialPurchaseOrders, {
    fields: [materialPurchaseOrderItems.materialPurchaseOrderId],
    references: [materialPurchaseOrders.id],
  }),
  material: one(materials, {
    fields: [materialPurchaseOrderItems.materialCode],
    references: [materials.code],
  }),
  contractItemAllocations: many(materialPurchaseOrderItemContractItems),
  requisitionItemAllocations: many(materialPurchaseOrderItemRequisitionItems),
  receiptItems: many(materialPurchaseReceiptItems),
}));

export const materialPurchaseOrderItemContractItemsRelations = relations(
  materialPurchaseOrderItemContractItems,
  ({ one }) => ({
    materialPurchaseOrderItem: one(materialPurchaseOrderItems, {
      fields: [materialPurchaseOrderItemContractItems.materialPurchaseOrderItemId],
      references: [materialPurchaseOrderItems.id],
    }),
    contractItem: one(contractItems, {
      fields: [materialPurchaseOrderItemContractItems.contractItemId],
      references: [contractItems.id],
    }),
  }),
);

export const materialPurchaseOrderItemRequisitionItemsRelations = relations(
  materialPurchaseOrderItemRequisitionItems,
  ({ one }) => ({
    materialPurchaseOrderItem: one(materialPurchaseOrderItems, {
      fields: [materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId],
      references: [materialPurchaseOrderItems.id],
    }),
    materialPurchaseRequisitionItem: one(materialPurchaseRequisitionItems, {
      fields: [materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId],
      references: [materialPurchaseRequisitionItems.id],
    }),
  }),
);

export const materialPurchaseReceiptsRelations = relations(materialPurchaseReceipts, ({ one, many }) => ({
  materialPurchaseOrder: one(materialPurchaseOrders, {
    fields: [materialPurchaseReceipts.materialPurchaseOrderId],
    references: [materialPurchaseOrders.id],
  }),
  receivedBy: one(users, {
    fields: [materialPurchaseReceipts.receivedBy],
    references: [users.id],
    relationName: 'materialPurchaseReceiptReceivedBy',
  }),
  createdBy: one(users, {
    fields: [materialPurchaseReceipts.createdBy],
    references: [users.id],
    relationName: 'materialPurchaseReceiptCreatedBy',
  }),
  items: many(materialPurchaseReceiptItems),
  inventoryTransactions: many(inventoryTransactions),
}));

export const materialPurchaseReceiptItemsRelations = relations(materialPurchaseReceiptItems, ({ one }) => ({
  materialPurchaseReceipt: one(materialPurchaseReceipts, {
    fields: [materialPurchaseReceiptItems.materialPurchaseReceiptId],
    references: [materialPurchaseReceipts.id],
  }),
  materialPurchaseOrderItem: one(materialPurchaseOrderItems, {
    fields: [materialPurchaseReceiptItems.materialPurchaseOrderItemId],
    references: [materialPurchaseOrderItems.id],
  }),
}));
