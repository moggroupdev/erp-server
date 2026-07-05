import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { customerAddresses } from './customers';
import { customerReceptions } from './customer-receptions';
import { users } from './users';
import { productUnits } from './product-units';

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: INS-00000001
    // Status can be deduced from these dates
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('installations_code_idx').on(table.code),
    index('installations_assigned_to_idx').on(table.assignedTo),
    index('installations_scheduled_at_idx').on(table.scheduledAt),
    index('installations_installed_at_idx').on(table.installedAt),
    index('installations_cancelled_at_idx').on(table.cancelledAt),
    check('installations_installed_cancelled_exclusive', sql`${table.installedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    check(
      'installations_installed_at_gte_scheduled_at',
      sql`${table.installedAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.installedAt} >= ${table.scheduledAt}`,
    ),
    check(
      'installations_cancelled_at_gte_scheduled_at',
      sql`${table.cancelledAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.cancelledAt} >= ${table.scheduledAt}`,
    ),
  ],
);

export const installationAddresses = pgTable(
  'installation_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id),
    customerAddressId: uuid('customer_address_id') // app-checked — must belong to a customer whose units are on this installation
      .notNull()
      .references(() => customerAddresses.id),
  },
  (table) => [
    index('installation_addresses_installation_id_idx').on(table.installationId),
    index('installation_addresses_customer_address_id_idx').on(table.customerAddressId),
  ],
);

export const installationItems = pgTable(
  'installation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .unique()
      .references(() => productUnits.id),
    notes: text('notes'),
  },
  (table) => [index('installation_items_installation_id_idx').on(table.installationId)],
);

// ============================== RELATIONS ==============================

export const installationsRelations = relations(installations, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [installations.createdBy],
    references: [users.id],
    relationName: 'installationCreatedBy',
  }),
  assignedTo: one(users, {
    fields: [installations.assignedTo],
    references: [users.id],
    relationName: 'installationAssignedTo',
  }),
  addresses: many(installationAddresses),
  items: many(installationItems),
  customerReceptions: many(customerReceptions),
}));

export const installationAddressesRelations = relations(installationAddresses, ({ one }) => ({
  installation: one(installations, {
    fields: [installationAddresses.installationId],
    references: [installations.id],
  }),
  customerAddress: one(customerAddresses, {
    fields: [installationAddresses.customerAddressId],
    references: [customerAddresses.id],
  }),
}));

export const installationItemsRelations = relations(installationItems, ({ one }) => ({
  installation: one(installations, {
    fields: [installationItems.installationId],
    references: [installations.id],
  }),
  productUnit: one(productUnits, {
    fields: [installationItems.productUnitId],
    references: [productUnits.id],
  }),
}));
