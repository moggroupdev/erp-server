import { and, eq, sql } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  customers,
  customerAddresses,
  customerContactPersons,
  inquiries,
  contracts,
  customerReceptions,
  maintenanceOrders,
  legacyIssuePermits,
} from 'src/database/schema';
import { type CustomerClassification, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { MergeCustomerDto } from './dto/merge-customer.dto';

const ID_PRINT_LIMIT = 20;

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  commercialRegistrationNumber: string | null;
  classification: CustomerClassification | null;
  notes: string | null;
  blacklistedAt: Date | null;
  addedToBlacklistBy: string | null;
};

type Collision = { labelEn: string; labelAr: string; ids: string[] };

type RefCount = { key: string; count: number };

type UniqueFieldPlan = {
  column: keyof Pick<CustomerRow, 'phone' | 'email' | 'taxNumber' | 'commercialRegistrationNumber'>;
  dbColumn: 'phone' | 'email' | 'tax_number' | 'commercial_registration_number';
  keepValue: string | null;
  removeValue: string | null;
  fill: boolean;
};

type FillFieldPlan = {
  label: 'classification' | 'website' | 'notes';
  keepValue: string | null;
  removeValue: string | null;
  fill: boolean;
  drop: boolean;
};

type FlagClearPlan = {
  clearRemovedDefaultAddress: boolean;
  clearRemovedPrimaryContact: boolean;
  keptHasDefaultAddress: boolean;
  removedHasDefaultAddress: boolean;
  keptHasPrimaryContact: boolean;
  removedHasPrimaryContact: boolean;
};

type FieldMergePlan = {
  uniqueFields: UniqueFieldPlan[];
  fillFields: FillFieldPlan[];
  copyBlacklist: boolean;
  nameKept: string;
  nameDropped: string | null;
};

type ScanResult = {
  refCounts: RefCount[];
  followCounts: RefCount[];
  collisions: Collision[];
  flagClear: FlagClearPlan;
};

type CustomerSummary = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  commercialRegistrationNumber: string | null;
  classification: CustomerClassification | null;
  website: string | null;
  notes: string | null;
  blacklistedAt: Date | null;
};

export type CustomerMergePreview = {
  kept: CustomerSummary;
  removed: CustomerSummary | null;
  referenceCounts: RefCount[];
  followCounts: RefCount[];
  flagClear: FlagClearPlan | null;
  fieldPlan: FieldMergePlan | null;
  blockers: string[];
  canMerge: boolean;
};

type PreparedMerge = {
  kept: CustomerRow;
  removed: CustomerRow | null;
  fieldPlan: FieldMergePlan | null;
  scan: ScanResult | null;
  blockers: string[];
};

/** Hardcoded customer FK inventory for merge. Keep in sync with customer FKs (see AGENTS.md → Customer merge service). */
const CUSTOMER_REF_COLUMNS: { key: string; table: string; column: string }[] = [
  { key: 'customer_addresses', table: 'customer_addresses', column: 'customer_id' },
  { key: 'customer_contact_persons', table: 'customer_contact_persons', column: 'customer_id' },
  { key: 'inquiries', table: 'inquiries', column: 'customer_id' },
  { key: 'contracts', table: 'contracts', column: 'customer_id' },
  { key: 'customer_receptions', table: 'customer_receptions', column: 'customer_id' },
  { key: 'maintenance_orders', table: 'maintenance_orders', column: 'customer_id' },
  { key: 'legacy_issue_permits', table: 'legacy_issue_permits', column: 'customer_id' },
];

@Injectable()
export class CustomerMergeService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async preview(keepId: string, removeId: string): Promise<CustomerMergePreview> {
    const prepared = await this.prepare(keepId, removeId.trim(), this.db);
    return this.toPreviewResponse(prepared);
  }

  public async merge(keepId: string, dto: MergeCustomerDto, _user: User) {
    return await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      const prepared = await this.prepare(keepId, dto.removeId, tx);
      if (prepared.blockers.length > 0) {
        throw new ConflictException(prepared.blockers.join(' '));
      }

      const { kept, removed, fieldPlan, scan } = prepared;
      if (!removed || !fieldPlan || !scan) {
        throw new ConflictException(translate('Merge cannot proceed.', 'لا يمكن متابعة الدمج.'));
      }

      if (dto.confirmationCode.trim() !== removed.code) {
        throw new BadRequestException(
          translate(
            'Confirmation code does not match the customer code to remove.',
            'رمز التأكيد لا يطابق كود العميل المراد إزالته.',
          ),
        );
      }

      await this.runMerge(tx, kept.id, removed.id, kept, removed, fieldPlan, scan);

      const [updated] = await tx.select().from(customers).where(eq(customers.id, keepId)).limit(1);
      return updated;
    });
  }

  // ============================== PREPARE / PREVIEW ==============================

  private async prepare(keepId: string, removeId: string, db: DrizzleDB): Promise<PreparedMerge> {
    const blockers: string[] = [];

    if (keepId === removeId) {
      blockers.push(
        translate('Keep and remove must be different customers.', 'يجب أن يكون عميل الإبقاء وعميل الإزالة مختلفين.'),
      );
    }

    const kept = await this.loadCustomer(db, keepId);
    if (!kept) {
      throw new NotFoundException(
        translate(`Customer with id ${keepId} does not exist.`, `لا يوجد عميل بالمعرّف ${keepId}.`),
      );
    }

    const removed = await this.loadCustomer(db, removeId);
    if (!removed) {
      blockers.push(
        translate(`Removed customer ${removeId} was not found.`, `العميل المراد إزالته ${removeId} غير موجود.`),
      );
      return {
        kept,
        removed: null,
        fieldPlan: null,
        scan: null,
        blockers,
      };
    }

    const fieldPlan = this.planFieldMerge(kept, removed);
    const uniqueConflicts = fieldPlan.uniqueFields.filter(
      (field) => field.keepValue != null && field.removeValue != null && field.keepValue !== field.removeValue,
    );
    if (uniqueConflicts.length > 0) {
      const details = uniqueConflicts
        .map((field) => `${field.dbColumn}: keep=${field.keepValue}, remove=${field.removeValue}`)
        .join('; ');
      blockers.push(
        translate(`Unique identity conflict: ${details}`, `تعارض في بيانات الهوية الفريدة: ${details}`),
      );
    }

    let scan: ScanResult | null = null;
    if (keepId !== removeId) {
      scan = await this.scanReferences(db, kept.id, removed.id);

      const liveCollisions = scan.collisions.filter((row) => row.ids.length > 0);
      for (const collision of liveCollisions) {
        blockers.push(
          translate(
            `${collision.labelEn}: ${this.formatIdList(collision.ids)}`,
            `${collision.labelAr}: ${this.formatIdList(collision.ids)}`,
          ),
        );
      }
    }

    return {
      kept,
      removed,
      fieldPlan,
      scan,
      blockers,
    };
  }

  private toPreviewResponse(prepared: PreparedMerge): CustomerMergePreview {
    return {
      kept: this.toSummary(prepared.kept),
      removed: prepared.removed ? this.toSummary(prepared.removed) : null,
      referenceCounts: (prepared.scan?.refCounts ?? []).filter((row) => row.count > 0),
      followCounts: (prepared.scan?.followCounts ?? []).filter((row) => row.count > 0),
      flagClear: prepared.scan?.flagClear ?? null,
      fieldPlan: prepared.fieldPlan,
      blockers: prepared.blockers,
      canMerge: prepared.blockers.length === 0,
    };
  }

  private toSummary(customer: CustomerRow): CustomerSummary {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      taxNumber: customer.taxNumber,
      commercialRegistrationNumber: customer.commercialRegistrationNumber,
      classification: customer.classification,
      website: customer.website,
      notes: customer.notes,
      blacklistedAt: customer.blacklistedAt,
    };
  }

  private async loadCustomer(db: DrizzleDB, id: string): Promise<CustomerRow | undefined> {
    const [row] = await db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        website: customers.website,
        taxNumber: customers.taxNumber,
        commercialRegistrationNumber: customers.commercialRegistrationNumber,
        classification: customers.classification,
        notes: customers.notes,
        blacklistedAt: customers.blacklistedAt,
        addedToBlacklistBy: customers.addedToBlacklistBy,
      })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);

    return row;
  }

  private planFieldMerge(kept: CustomerRow, removed: CustomerRow): FieldMergePlan {
    const uniqueSpecs: {
      column: UniqueFieldPlan['column'];
      dbColumn: UniqueFieldPlan['dbColumn'];
      keepValue: string | null;
      removeValue: string | null;
    }[] = [
      { column: 'phone', dbColumn: 'phone', keepValue: kept.phone, removeValue: removed.phone },
      { column: 'email', dbColumn: 'email', keepValue: kept.email, removeValue: removed.email },
      {
        column: 'taxNumber',
        dbColumn: 'tax_number',
        keepValue: kept.taxNumber,
        removeValue: removed.taxNumber,
      },
      {
        column: 'commercialRegistrationNumber',
        dbColumn: 'commercial_registration_number',
        keepValue: kept.commercialRegistrationNumber,
        removeValue: removed.commercialRegistrationNumber,
      },
    ];

    const uniqueFields: UniqueFieldPlan[] = uniqueSpecs.map((spec) => ({
      ...spec,
      fill: spec.keepValue == null && spec.removeValue != null,
    }));

    const fillSpecs: {
      label: FillFieldPlan['label'];
      keepValue: string | null;
      removeValue: string | null;
    }[] = [
      { label: 'classification', keepValue: kept.classification, removeValue: removed.classification },
      { label: 'website', keepValue: kept.website, removeValue: removed.website },
      { label: 'notes', keepValue: kept.notes, removeValue: removed.notes },
    ];

    const fillFields: FillFieldPlan[] = fillSpecs.map((spec) => ({
      ...spec,
      fill: spec.keepValue == null && spec.removeValue != null,
      drop: spec.keepValue != null && spec.removeValue != null && spec.keepValue !== spec.removeValue,
    }));

    const copyBlacklist = kept.blacklistedAt == null && removed.blacklistedAt != null;
    const nameDropped = kept.name !== removed.name ? removed.name : null;

    return {
      uniqueFields,
      fillFields,
      copyBlacklist,
      nameKept: kept.name,
      nameDropped,
    };
  }

  // ============================== SCAN ==============================

  private async scanReferences(db: DrizzleDB, keepId: string, removeId: string): Promise<ScanResult> {
    const refCounts: RefCount[] = [];
    for (const target of CUSTOMER_REF_COLUMNS) {
      refCounts.push({
        key: target.key,
        count: await this.countSql(
          db,
          sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${removeId}`,
        ),
      });
    }

    const followCounts: RefCount[] = [
      {
        key: 'service_agreements_via_addresses',
        count: await this.countSql(
          db,
          sql`
            SELECT count(*)::int AS count
            FROM service_agreements sa
            INNER JOIN customer_addresses ca ON ca.id = sa.customer_address_id
            WHERE ca.customer_id = ${removeId}
          `,
        ),
      },
      {
        key: 'contracts_delivery_address',
        count: await this.countSql(
          db,
          sql`
            SELECT count(*)::int AS count
            FROM contracts c
            INNER JOIN customer_addresses ca ON ca.id = c.delivery_address_id
            WHERE ca.customer_id = ${removeId}
          `,
        ),
      },
      {
        key: 'maintenance_orders_address',
        count: await this.countSql(
          db,
          sql`
            SELECT count(*)::int AS count
            FROM maintenance_orders mo
            INNER JOIN customer_addresses ca ON ca.id = mo.customer_address_id
            WHERE ca.customer_id = ${removeId}
          `,
        ),
      },
      {
        key: 'maintenance_orders_service_agreement',
        count: await this.countSql(
          db,
          sql`
            SELECT count(*)::int AS count
            FROM maintenance_orders mo
            INNER JOIN service_agreements sa ON sa.id = mo.service_agreement_id
            INNER JOIN customer_addresses ca ON ca.id = sa.customer_address_id
            WHERE ca.customer_id = ${removeId}
          `,
        ),
      },
    ];

    const flagClear = await this.loadFlagClearPlan(db, keepId, removeId);

    const collisions: Collision[] = [
      {
        labelEn: 'contracts.customer_id vs inquiries.customer_id (third customer after merge)',
        labelAr: 'تعارض عميل العقد مع عميل الاستفسار (عميل ثالث بعد الدمج)',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT c.code AS parent_id
            FROM contracts c
            INNER JOIN inquiries i ON i.id = c.inquiry_id
            WHERE (c.customer_id = ${keepId} OR c.customer_id = ${removeId} OR i.customer_id = ${keepId} OR i.customer_id = ${removeId})
              AND CASE
                    WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE c.customer_id
                  END
                  IS DISTINCT FROM
                  CASE
                    WHEN i.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE i.customer_id
                  END
          `,
        ),
      },
      {
        labelEn: 'contracts.customer_id vs delivery address customer (third customer after merge)',
        labelAr: 'تعارض عميل العقد مع عميل عنوان التسليم (عميل ثالث بعد الدمج)',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT c.code AS parent_id
            FROM contracts c
            INNER JOIN customer_addresses ca ON ca.id = c.delivery_address_id
            WHERE (c.customer_id = ${keepId} OR c.customer_id = ${removeId} OR ca.customer_id = ${keepId} OR ca.customer_id = ${removeId})
              AND CASE
                    WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE c.customer_id
                  END
                  IS DISTINCT FROM
                  CASE
                    WHEN ca.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE ca.customer_id
                  END
          `,
        ),
      },
      {
        labelEn: 'maintenance_orders.customer_id vs address customer (third customer after merge)',
        labelAr: 'تعارض عميل أمر الصيانة مع عميل العنوان (عميل ثالث بعد الدمج)',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT mo.code AS parent_id
            FROM maintenance_orders mo
            LEFT JOIN customer_addresses direct_ca ON direct_ca.id = mo.customer_address_id
            LEFT JOIN service_agreements sa ON sa.id = mo.service_agreement_id
            LEFT JOIN customer_addresses sa_ca ON sa_ca.id = sa.customer_address_id
            WHERE (
                mo.customer_id = ${keepId}
                OR mo.customer_id = ${removeId}
                OR direct_ca.customer_id = ${keepId}
                OR direct_ca.customer_id = ${removeId}
                OR sa_ca.customer_id = ${keepId}
                OR sa_ca.customer_id = ${removeId}
              )
              AND COALESCE(direct_ca.customer_id, sa_ca.customer_id) IS NOT NULL
              AND CASE
                    WHEN mo.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE mo.customer_id
                  END
                  IS DISTINCT FROM
                  CASE
                    WHEN COALESCE(direct_ca.customer_id, sa_ca.customer_id) IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE COALESCE(direct_ca.customer_id, sa_ca.customer_id)
                  END
          `,
        ),
      },
      {
        labelEn: 'customer_receptions.customer_id vs unit contract customer (third customer after merge)',
        labelAr: 'تعارض عميل الاستلام مع عميل عقد الوحدة (عميل ثالث بعد الدمج)',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT DISTINCT cr.code AS parent_id
            FROM customer_receptions cr
            INNER JOIN customer_reception_items cri ON cri.customer_reception_id = cr.id
            INNER JOIN product_units pu ON pu.id = cri.product_unit_id
            INNER JOIN contract_items ci ON ci.id = pu.contract_item_id
            INNER JOIN contracts c ON c.id = ci.contract_id
            WHERE (
                cr.customer_id = ${keepId}
                OR cr.customer_id = ${removeId}
                OR c.customer_id = ${keepId}
                OR c.customer_id = ${removeId}
              )
              AND CASE
                    WHEN cr.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE cr.customer_id
                  END
                  IS DISTINCT FROM
                  CASE
                    WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                    ELSE c.customer_id
                  END
          `,
        ),
      },
    ];

    return { refCounts, followCounts, collisions, flagClear };
  }

  private async loadFlagClearPlan(db: DrizzleDB, keepId: string, removeId: string): Promise<FlagClearPlan> {
    const keptHasDefaultAddress =
      (await this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM customer_addresses WHERE customer_id = ${keepId} AND is_default = true`,
      )) > 0;
    const removedHasDefaultAddress =
      (await this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM customer_addresses WHERE customer_id = ${removeId} AND is_default = true`,
      )) > 0;
    const keptHasPrimaryContact =
      (await this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM customer_contact_persons WHERE customer_id = ${keepId} AND is_primary = true`,
      )) > 0;
    const removedHasPrimaryContact =
      (await this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM customer_contact_persons WHERE customer_id = ${removeId} AND is_primary = true`,
      )) > 0;

    return {
      clearRemovedDefaultAddress: keptHasDefaultAddress && removedHasDefaultAddress,
      clearRemovedPrimaryContact: keptHasPrimaryContact && removedHasPrimaryContact,
      keptHasDefaultAddress,
      removedHasDefaultAddress,
      keptHasPrimaryContact,
      removedHasPrimaryContact,
    };
  }

  // ============================== WRITE ==============================

  private async runMerge(
    tx: DrizzleDB,
    keepId: string,
    removeId: string,
    kept: CustomerRow,
    removed: CustomerRow,
    fieldPlan: FieldMergePlan,
    scan: ScanResult,
  ): Promise<void> {
    if (scan.flagClear.clearRemovedDefaultAddress) {
      const cleared = await tx
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(and(eq(customerAddresses.customerId, removeId), eq(customerAddresses.isDefault, true)))
        .returning({ id: customerAddresses.id });
      this.expectUpdated('customer_addresses (clear removed default)', 1, cleared.length);
    }

    if (scan.flagClear.clearRemovedPrimaryContact) {
      const cleared = await tx
        .update(customerContactPersons)
        .set({ isPrimary: false })
        .where(and(eq(customerContactPersons.customerId, removeId), eq(customerContactPersons.isPrimary, true)))
        .returning({ id: customerContactPersons.id });
      this.expectUpdated('customer_contact_persons (clear removed primary)', 1, cleared.length);
    }

    const fillsToApply = fieldPlan.uniqueFields.filter((field) => field.fill);
    if (fillsToApply.length > 0) {
      const clearSet: Partial<Record<'phone' | 'email' | 'taxNumber' | 'commercialRegistrationNumber', null>> = {};
      for (const field of fillsToApply) {
        clearSet[field.column] = null;
      }
      const cleared = await tx
        .update(customers)
        .set(clearSet)
        .where(eq(customers.id, removeId))
        .returning({ id: customers.id });
      this.expectUpdated('customers (clear unique fields on removed)', 1, cleared.length);
    }

    const countByKey = (key: string) => scan.refCounts.find((row) => row.key === key)?.count ?? 0;

    const simpleUpdates: { key: string; run: () => Promise<{ id: string }[]> }[] = [
      {
        key: 'customer_addresses',
        run: () =>
          tx
            .update(customerAddresses)
            .set({ customerId: keepId })
            .where(eq(customerAddresses.customerId, removeId))
            .returning({ id: customerAddresses.id }),
      },
      {
        key: 'customer_contact_persons',
        run: () =>
          tx
            .update(customerContactPersons)
            .set({ customerId: keepId })
            .where(eq(customerContactPersons.customerId, removeId))
            .returning({ id: customerContactPersons.id }),
      },
      {
        key: 'inquiries',
        run: () =>
          tx
            .update(inquiries)
            .set({ customerId: keepId })
            .where(eq(inquiries.customerId, removeId))
            .returning({ id: inquiries.id }),
      },
      {
        key: 'contracts',
        run: () =>
          tx
            .update(contracts)
            .set({ customerId: keepId })
            .where(eq(contracts.customerId, removeId))
            .returning({ id: contracts.id }),
      },
      {
        key: 'customer_receptions',
        run: () =>
          tx
            .update(customerReceptions)
            .set({ customerId: keepId })
            .where(eq(customerReceptions.customerId, removeId))
            .returning({ id: customerReceptions.id }),
      },
      {
        key: 'maintenance_orders',
        run: () =>
          tx
            .update(maintenanceOrders)
            .set({ customerId: keepId })
            .where(eq(maintenanceOrders.customerId, removeId))
            .returning({ id: maintenanceOrders.id }),
      },
      {
        key: 'legacy_issue_permits',
        run: () =>
          tx
            .update(legacyIssuePermits)
            .set({ customerId: keepId })
            .where(eq(legacyIssuePermits.customerId, removeId))
            .returning({ id: legacyIssuePermits.id }),
      },
    ];

    for (const target of simpleUpdates) {
      const updated = await target.run();
      this.expectUpdated(target.key, countByKey(target.key), updated.length);
    }

    const keptUpdate: {
      phone?: string | null;
      email?: string | null;
      taxNumber?: string | null;
      commercialRegistrationNumber?: string | null;
      classification?: CustomerClassification | null;
      website?: string | null;
      notes?: string | null;
      blacklistedAt?: Date | null;
      addedToBlacklistBy?: string | null;
    } = {};

    for (const field of fieldPlan.uniqueFields) {
      if (field.fill) {
        keptUpdate[field.column] = field.removeValue;
      }
    }
    for (const field of fieldPlan.fillFields) {
      if (!field.fill) continue;
      if (field.label === 'classification') keptUpdate.classification = removed.classification;
      if (field.label === 'website') keptUpdate.website = removed.website;
      if (field.label === 'notes') keptUpdate.notes = removed.notes;
    }
    if (fieldPlan.copyBlacklist) {
      keptUpdate.blacklistedAt = removed.blacklistedAt;
      keptUpdate.addedToBlacklistBy = removed.addedToBlacklistBy;
    }

    if (Object.keys(keptUpdate).length > 0) {
      const updated = await tx
        .update(customers)
        .set(keptUpdate)
        .where(eq(customers.id, keepId))
        .returning({ id: customers.id });
      this.expectUpdated('customers (kept fields)', 1, updated.length);
    }

    const deleted = await tx.delete(customers).where(eq(customers.id, removeId)).returning({ id: customers.id });
    this.expectUpdated('customers (delete removed)', 1, deleted.length);

    const remaining = await this.countRemaining(tx, removeId);
    const leftover = remaining.filter((row) => row.count > 0);
    if (leftover.length > 0) {
      const details = leftover.map((row) => `${row.key}=${row.count}`).join(', ');
      throw new ConflictException(
        translate(
          `Post-merge verification failed: ${details} still reference ${removed.code}.`,
          `فشل التحقق بعد الدمج: ${details} ما زالت تشير إلى ${removed.code}.`,
        ),
      );
    }
  }

  private async countRemaining(db: DrizzleDB, removeId: string): Promise<RefCount[]> {
    const counts: RefCount[] = [];
    for (const target of CUSTOMER_REF_COLUMNS) {
      counts.push({
        key: target.key,
        count: await this.countSql(
          db,
          sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${removeId}`,
        ),
      });
    }
    return counts;
  }

  private expectUpdated(name: string, expected: number, actual: number): void {
    if (actual !== expected) {
      throw new ConflictException(
        translate(
          `${name}: expected to update ${expected} row(s), actually updated ${actual}.`,
          `${name}: متوقع تحديث ${expected} صف(وف)، تم تحديث ${actual}.`,
        ),
      );
    }
  }

  // ============================== HELPERS ==============================

  private async countSql(db: DrizzleDB, query: ReturnType<typeof sql>): Promise<number> {
    const rows = this.executeRows(await db.execute(query));
    return this.toCount(rows[0]?.count ?? 0);
  }

  private async collisionParentIds(db: DrizzleDB, query: ReturnType<typeof sql>): Promise<string[]> {
    return this.executeRows(await db.execute(query))
      .map((row) => String(row.parent_id ?? ''))
      .filter(Boolean);
  }

  private formatIdList(ids: string[]): string {
    if (ids.length === 0) return '(none)';
    const shown = ids.slice(0, ID_PRINT_LIMIT);
    const extra = ids.length - shown.length;
    return extra > 0 ? `${shown.join(', ')} ... +${extra} more` : shown.join(', ');
  }

  private executeRows(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) return result as Record<string, unknown>[];
    if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
      return (result as { rows: Record<string, unknown>[] }).rows;
    }
    throw new Error('Unexpected execute() result shape.');
  }

  private toCount(value: unknown): number {
    const count = Number(value);
    if (!Number.isFinite(count)) throw new Error(`Could not parse row count: ${String(value)}`);
    return count;
  }
}
