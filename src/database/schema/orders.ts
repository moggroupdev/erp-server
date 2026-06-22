import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { numeric, createdAt, dimensionUnitEnum, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { customers, customerAddresses } from './customers';
import { users } from './users';
import { products } from './products';
import { inquiries } from './inquiries';
import { offers, offerItems } from './offers';
import { productionPlanItems } from './production-plans';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    offerId: uuid('offer_id')
      .unique()
      .references(() => offers.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    deliveryAddressId: uuid('delivery_address_id')
      .notNull()
      .references(() => customerAddresses.id),
    deliveryTime: timestamp('delivery_time', { withTimezone: true }), // Estimated delivery time
    totalAmount: numeric('total_amount').notNull(),
    // Order status can be deduced from these dates:
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('orders_inquiry_id_idx').on(table.inquiryId),
    index('orders_customer_id_idx').on(table.customerId),
    index('orders_delivery_time_idx').on(table.deliveryTime),
    index('orders_completed_at_idx').on(table.completedAt),
    index('orders_cancelled_at_idx').on(table.cancelledAt),
    index('orders_created_by_idx').on(table.createdBy),
    index('orders_created_at_idx').on(table.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    offerItemId: uuid('offer_item_id').references(() => offerItems.id), // Nullable as not all orders are from offers
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    title: text('title'),
    standard: boolean('standard').notNull().default(true),
    unitPrice: numeric('unit_price').notNull(),
    quantity: integer('quantity').notNull().default(1),
    quantityProduced: integer('quantity_produced').notNull().default(0),
    notes: text('notes'),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_offer_item_id_idx').on(table.offerItemId),
    index('order_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('order_items_quantity_positive', table.quantity),
    nonNegativeQuantityCheck('order_items_quantity_produced_non_negative', table.quantityProduced),
  ],
);

// In case of custom dimensions (not standard)
export const orderItemDimensions = pgTable(
  'order_item_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .unique()
      .references(() => orderItems.id),
    length: numeric('length').notNull(),
    width: numeric('width').notNull(),
    height: numeric('height').notNull(),
    unit: dimensionUnitEnum('unit').notNull(),
  },
  (table) => [
    nonNegativeQuantityCheck('order_item_dimensions_length_non_negative', table.length),
    nonNegativeQuantityCheck('order_item_dimensions_width_non_negative', table.width),
    nonNegativeQuantityCheck('order_item_dimensions_height_non_negative', table.height),
  ],
);

// ============================== RELATIONS ==============================

export const ordersRelations = relations(orders, ({ one, many }) => ({
  inquiry: one(inquiries, {
    fields: [orders.inquiryId],
    references: [inquiries.id],
  }),
  offer: one(offers, {
    fields: [orders.offerId],
    references: [offers.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  deliveryAddress: one(customerAddresses, {
    fields: [orders.deliveryAddressId],
    references: [customerAddresses.id],
  }),
  createdBy: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  offerItem: one(offerItems, {
    fields: [orderItems.offerItemId],
    references: [offerItems.id],
  }),
  product: one(products, {
    fields: [orderItems.productCode],
    references: [products.code],
  }),
  dimensions: one(orderItemDimensions, {
    fields: [orderItems.id],
    references: [orderItemDimensions.orderItemId],
  }),
  planItems: many(productionPlanItems),
}));

export const orderItemDimensionsRelations = relations(orderItemDimensions, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [orderItemDimensions.orderItemId],
    references: [orderItems.id],
  }),
}));
