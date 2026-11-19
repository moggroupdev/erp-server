import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrders,
  outsourcingOrders,
  productPurchaseOrders,
  supplierInvoices,
  suppliers,
  users,
} from 'src/database/schema';
import { translate } from 'src/utils/i18n/translate';

const VALID_GROUP_BY = ['month', 'quarter', 'year'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

const ORDER_TYPE_VALUES = ['material', 'product', 'outsourcing'] as const;
type OrderType = (typeof ORDER_TYPE_VALUES)[number];

const moneySum = (column: AnyPgColumn) => sql<number>`coalesce(sum(coalesce(${column}, 0)), 0)`;

@Injectable()
export class AccountingReportsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getSupplierInvoices(params: {
    supplierId: string;
    from?: string;
    to?: string;
    groupBy?: string;
  }) {
    const supplierId = params.supplierId?.trim();
    if (!supplierId) {
      throw new BadRequestException(translate('Supplier is required.', 'المورد مطلوب.'));
    }

    const [supplier] = await this.db
      .select({ id: suppliers.id, code: suppliers.code, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (!supplier) {
      throw new NotFoundException(
        translate(`Supplier with ID ${supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${supplierId}.`),
      );
    }

    const groupBy = this.parseGroupBy(params.groupBy);
    const dateRange = this.buildDateRange(params.from, params.to);
    const scopedWhere = this.invoicesWhere(supplierId, dateRange);

    const [overview, byOrderType, byPeriod, invoices] = await Promise.all([
      this.getOverview(scopedWhere),
      this.getByOrderType(scopedWhere),
      this.getByPeriod(scopedWhere, groupBy),
      this.getInvoices(scopedWhere),
    ]);

    return {
      supplier,
      overview,
      byOrderType,
      byPeriod,
      invoices,
    };
  }

  private parseGroupBy(value?: string): GroupBy {
    if (value && (VALID_GROUP_BY as readonly string[]).includes(value)) return value as GroupBy;
    return 'month';
  }

  private buildDateRange(from?: string, to?: string): { from?: Date; to?: Date } {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }

  private invoicesWhere(supplierId: string, dateRange: { from?: Date; to?: Date }): SQL {
    const conditions: SQL[] = [eq(supplierInvoices.supplierId, supplierId)];

    if (dateRange.from || dateRange.to) {
      conditions.push(isNotNull(supplierInvoices.issuedAt));
      if (dateRange.from) conditions.push(gte(supplierInvoices.issuedAt, dateRange.from));
      if (dateRange.to) conditions.push(lte(supplierInvoices.issuedAt, dateRange.to));
    }

    return and(...conditions)!;
  }

  private async getOverview(where: SQL) {
    const [row] = await this.db
      .select({
        invoiceCount: sql<number>`count(*)`,
        totalPurchases: moneySum(supplierInvoices.totalPurchases),
        totalDiscount: moneySum(supplierInvoices.totalDiscount),
        vatAmount: moneySum(supplierInvoices.vatAmount),
        withholdingTaxAmount: moneySum(supplierInvoices.withholdingTaxAmount),
        totalAmount: moneySum(supplierInvoices.totalAmount),
        missingTotalCount: sql<number>`count(*) filter (where ${supplierInvoices.totalAmount} is null)`,
        withPdfCount: sql<number>`count(*) filter (where ${supplierInvoices.pdfFilename} is not null)`,
      })
      .from(supplierInvoices)
      .where(where);

    const invoiceCount = Number(row?.invoiceCount ?? 0);
    const totalAmount = Number(row?.totalAmount ?? 0);

    return {
      invoiceCount,
      totalPurchases: Number(row?.totalPurchases ?? 0),
      totalDiscount: Number(row?.totalDiscount ?? 0),
      vatAmount: Number(row?.vatAmount ?? 0),
      withholdingTaxAmount: Number(row?.withholdingTaxAmount ?? 0),
      totalAmount,
      avgTotalAmount: invoiceCount > 0 ? totalAmount / invoiceCount : 0,
      missingTotalCount: Number(row?.missingTotalCount ?? 0),
      withPdfCount: Number(row?.withPdfCount ?? 0),
    };
  }

  private async getByOrderType(where: SQL) {
    const [row] = await this.db
      .select({
        materialCount: sql<number>`count(*) filter (where ${supplierInvoices.materialPurchaseOrderId} is not null)`,
        materialTotalPurchases: sql<number>`coalesce(sum(case when ${supplierInvoices.materialPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalPurchases}, 0) else 0 end), 0)`,
        materialTotalDiscount: sql<number>`coalesce(sum(case when ${supplierInvoices.materialPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalDiscount}, 0) else 0 end), 0)`,
        materialVatAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.materialPurchaseOrderId} is not null then coalesce(${supplierInvoices.vatAmount}, 0) else 0 end), 0)`,
        materialWithholdingTaxAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.materialPurchaseOrderId} is not null then coalesce(${supplierInvoices.withholdingTaxAmount}, 0) else 0 end), 0)`,
        materialTotalAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.materialPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalAmount}, 0) else 0 end), 0)`,
        productCount: sql<number>`count(*) filter (where ${supplierInvoices.productPurchaseOrderId} is not null)`,
        productTotalPurchases: sql<number>`coalesce(sum(case when ${supplierInvoices.productPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalPurchases}, 0) else 0 end), 0)`,
        productTotalDiscount: sql<number>`coalesce(sum(case when ${supplierInvoices.productPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalDiscount}, 0) else 0 end), 0)`,
        productVatAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.productPurchaseOrderId} is not null then coalesce(${supplierInvoices.vatAmount}, 0) else 0 end), 0)`,
        productWithholdingTaxAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.productPurchaseOrderId} is not null then coalesce(${supplierInvoices.withholdingTaxAmount}, 0) else 0 end), 0)`,
        productTotalAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.productPurchaseOrderId} is not null then coalesce(${supplierInvoices.totalAmount}, 0) else 0 end), 0)`,
        outsourcingCount: sql<number>`count(*) filter (where ${supplierInvoices.outsourcingOrderId} is not null)`,
        outsourcingTotalPurchases: sql<number>`coalesce(sum(case when ${supplierInvoices.outsourcingOrderId} is not null then coalesce(${supplierInvoices.totalPurchases}, 0) else 0 end), 0)`,
        outsourcingTotalDiscount: sql<number>`coalesce(sum(case when ${supplierInvoices.outsourcingOrderId} is not null then coalesce(${supplierInvoices.totalDiscount}, 0) else 0 end), 0)`,
        outsourcingVatAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.outsourcingOrderId} is not null then coalesce(${supplierInvoices.vatAmount}, 0) else 0 end), 0)`,
        outsourcingWithholdingTaxAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.outsourcingOrderId} is not null then coalesce(${supplierInvoices.withholdingTaxAmount}, 0) else 0 end), 0)`,
        outsourcingTotalAmount: sql<number>`coalesce(sum(case when ${supplierInvoices.outsourcingOrderId} is not null then coalesce(${supplierInvoices.totalAmount}, 0) else 0 end), 0)`,
      })
      .from(supplierInvoices)
      .where(where);

    return ORDER_TYPE_VALUES.map((orderType) => {
      if (orderType === 'material') {
        return {
          orderType,
          invoiceCount: Number(row?.materialCount ?? 0),
          totalPurchases: Number(row?.materialTotalPurchases ?? 0),
          totalDiscount: Number(row?.materialTotalDiscount ?? 0),
          vatAmount: Number(row?.materialVatAmount ?? 0),
          withholdingTaxAmount: Number(row?.materialWithholdingTaxAmount ?? 0),
          totalAmount: Number(row?.materialTotalAmount ?? 0),
        };
      }
      if (orderType === 'product') {
        return {
          orderType,
          invoiceCount: Number(row?.productCount ?? 0),
          totalPurchases: Number(row?.productTotalPurchases ?? 0),
          totalDiscount: Number(row?.productTotalDiscount ?? 0),
          vatAmount: Number(row?.productVatAmount ?? 0),
          withholdingTaxAmount: Number(row?.productWithholdingTaxAmount ?? 0),
          totalAmount: Number(row?.productTotalAmount ?? 0),
        };
      }
      return {
        orderType,
        invoiceCount: Number(row?.outsourcingCount ?? 0),
        totalPurchases: Number(row?.outsourcingTotalPurchases ?? 0),
        totalDiscount: Number(row?.outsourcingTotalDiscount ?? 0),
        vatAmount: Number(row?.outsourcingVatAmount ?? 0),
        withholdingTaxAmount: Number(row?.outsourcingWithholdingTaxAmount ?? 0),
        totalAmount: Number(row?.outsourcingTotalAmount ?? 0),
      };
    });
  }

  private async getByPeriod(where: SQL, groupBy: GroupBy) {
    const datedWhere = and(where, isNotNull(supplierInvoices.issuedAt))!;
    const bucket = sql<string>`date_trunc('${sql.raw(groupBy)}', ${supplierInvoices.issuedAt})`;

    const rows = await this.db
      .select({
        period: bucket.as('period'),
        invoiceCount: sql<number>`count(*)`,
        totalAmount: moneySum(supplierInvoices.totalAmount),
      })
      .from(supplierInvoices)
      .where(datedWhere)
      .groupBy(sql`period`)
      .orderBy(sql`period`);

    return rows.map((row) => ({
      period: String(row.period),
      invoiceCount: Number(row.invoiceCount ?? 0),
      totalAmount: Number(row.totalAmount ?? 0),
    }));
  }

  private async getInvoices(where: SQL) {
    const rows = await this.db
      .select({
        id: supplierInvoices.id,
        invoiceNumber: supplierInvoices.invoiceNumber,
        issuedAt: supplierInvoices.issuedAt,
        totalPurchases: supplierInvoices.totalPurchases,
        totalDiscount: supplierInvoices.totalDiscount,
        vatAmount: supplierInvoices.vatAmount,
        withholdingTaxAmount: supplierInvoices.withholdingTaxAmount,
        totalAmount: supplierInvoices.totalAmount,
        materialPurchaseOrderId: supplierInvoices.materialPurchaseOrderId,
        productPurchaseOrderId: supplierInvoices.productPurchaseOrderId,
        outsourcingOrderId: supplierInvoices.outsourcingOrderId,
        supplierId: supplierInvoices.supplierId,
        pdfFilename: supplierInvoices.pdfFilename,
        createdAt: supplierInvoices.createdAt,
        createdById: supplierInvoices.createdBy,
        createdByName: users.name,
        materialOrderCode: materialPurchaseOrders.code,
        productOrderCode: productPurchaseOrders.code,
        outsourcingOrderCode: outsourcingOrders.code,
      })
      .from(supplierInvoices)
      .innerJoin(users, eq(users.id, supplierInvoices.createdBy))
      .leftJoin(materialPurchaseOrders, eq(materialPurchaseOrders.id, supplierInvoices.materialPurchaseOrderId))
      .leftJoin(productPurchaseOrders, eq(productPurchaseOrders.id, supplierInvoices.productPurchaseOrderId))
      .leftJoin(outsourcingOrders, eq(outsourcingOrders.id, supplierInvoices.outsourcingOrderId))
      .where(where)
      .orderBy(desc(supplierInvoices.issuedAt), desc(supplierInvoices.createdAt));

    return rows.map((row) => {
      const order = this.resolveLinkedOrder(row);

      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        issuedAt: row.issuedAt,
        totalPurchases: row.totalPurchases == null ? null : Number(row.totalPurchases),
        totalDiscount: row.totalDiscount == null ? null : Number(row.totalDiscount),
        vatAmount: row.vatAmount == null ? null : Number(row.vatAmount),
        withholdingTaxAmount: row.withholdingTaxAmount == null ? null : Number(row.withholdingTaxAmount),
        totalAmount: row.totalAmount == null ? null : Number(row.totalAmount),
        materialPurchaseOrderId: row.materialPurchaseOrderId,
        productPurchaseOrderId: row.productPurchaseOrderId,
        outsourcingOrderId: row.outsourcingOrderId,
        supplierId: row.supplierId,
        pdfFilename: row.pdfFilename,
        hasPdf: Boolean(row.pdfFilename),
        createdAt: row.createdAt,
        createdBy: { id: row.createdById, name: row.createdByName },
        order,
      };
    });
  }

  private resolveLinkedOrder(row: {
    materialPurchaseOrderId: string | null;
    productPurchaseOrderId: string | null;
    outsourcingOrderId: string | null;
    materialOrderCode: string | null;
    productOrderCode: string | null;
    outsourcingOrderCode: string | null;
  }): { type: OrderType; id: string; code: string } {
    if (row.materialPurchaseOrderId && row.materialOrderCode) {
      return { type: 'material', id: row.materialPurchaseOrderId, code: row.materialOrderCode };
    }
    if (row.productPurchaseOrderId && row.productOrderCode) {
      return { type: 'product', id: row.productPurchaseOrderId, code: row.productOrderCode };
    }
    if (row.outsourcingOrderId && row.outsourcingOrderCode) {
      return { type: 'outsourcing', id: row.outsourcingOrderId, code: row.outsourcingOrderCode };
    }

    // Exclusive link is enforced in DB; fallback keeps the response shape stable.
    if (row.materialPurchaseOrderId) {
      return { type: 'material', id: row.materialPurchaseOrderId, code: row.materialOrderCode ?? '' };
    }
    if (row.productPurchaseOrderId) {
      return { type: 'product', id: row.productPurchaseOrderId, code: row.productOrderCode ?? '' };
    }
    return {
      type: 'outsourcing',
      id: row.outsourcingOrderId ?? '',
      code: row.outsourcingOrderCode ?? '',
    };
  }
}
