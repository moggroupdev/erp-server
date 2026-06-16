import { pgTable, uuid, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, itemProductionStatusEnum, numeric, orderStatusEnum, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { customers, customerAddresses } from './customers';
import { inquiries } from './inquiries';
import { products } from './products';
import { offers, offerItems } from './offers';

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  inquiryId: uuid('inquiry_id')
    .notNull()
    .references(() => inquiries.id),
  offerId: uuid('offer_id')
    .notNull()
    .unique()
    .references(() => offers.id),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  deliveryAddressId: uuid('delivery_address_id').references(() => customerAddresses.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalAmount: numeric('total_amount').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    offerItemId: uuid('offer_item_id').references(() => offerItems.id),
    productCode: text('product_code').references(() => products.code),
    title: text('title').notNull(),
    dimensions: text('dimensions'),
    standard: boolean('standard').notNull().default(false),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price').notNull(),
    quantityProduced: integer('quantity_produced').notNull().default(0),
    productionStatus: itemProductionStatusEnum('production_status').notNull().default('pending'),
    notes: text('notes'),
  },
  (table) => [
    nonNegativeQuantityCheck('order_items_quantity_non_negative', table.quantity),
    nonNegativeQuantityCheck('order_items_quantity_produced_non_negative', table.quantityProduced),
  ],
);

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

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
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
}));
