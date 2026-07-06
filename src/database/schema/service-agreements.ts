import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { createdAt, serviceContractIntervalEnum } from './common';
import { customerAddresses } from './customers';
import { users } from './users';
import { maintenanceOrders } from './maintenance-orders';

export const serviceAgreements = pgTable(
  'service_agreements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: SVC-00000001
    customerAddressId: uuid('customer_address_id')
      .notNull()
      .references(() => customerAddresses.id),
    interval: serviceContractIntervalEnum('interval').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('service_agreements_customer_address_id_idx').on(table.customerAddressId),
    index('service_agreements_started_at_idx').on(table.startedAt),
    check('service_agreements_ended_at_gt_started_at', sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`),
  ],
);

// ============================== RELATIONS ==============================

export const serviceAgreementsRelations = relations(serviceAgreements, ({ one, many }) => ({
  customerAddress: one(customerAddresses, {
    fields: [serviceAgreements.customerAddressId],
    references: [customerAddresses.id],
  }),
  createdBy: one(users, {
    fields: [serviceAgreements.createdBy],
    references: [users.id],
    relationName: 'serviceAgreementCreatedBy',
  }),
  maintenanceOrders: many(maintenanceOrders),
}));
