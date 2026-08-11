import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialPurchaseOrders, materialPurchaseReceipts } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

@Injectable()
export class MaterialPurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async listOrders(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseOrders, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyInvoiceNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: { supplier: { columns: { id: true, name: true } } },
    });
  }

  public async getOrder(id: string) {
    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, id),
      with: {
        supplier: { columns: { id: true, name: true } },
        createdBy: { columns: { id: true, name: true } },
        items: {
          with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
        },
      },
    });

    if (!order)
      throw new NotFoundException(
        translate(`Material purchase order with ID ${id} does not exist.`, `لا يوجد أمر شراء مواد بالمعرف ${id}.`),
      );

    return order;
  }

  public async listReceipts(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseReceipts, queryParams, {
      filtering: true,
      searchableFields: ['code', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async getReceipt(id: string) {
    const receipt = await this.db.query.materialPurchaseReceipts.findFirst({
      where: eq(materialPurchaseReceipts.id, id),
      with: {
        materialPurchaseOrder: { columns: { id: true, legacyInvoiceNumber: true } },
        inventoryTransactions: { columns: { id: true, legacyNumber: true } },
        createdBy: { columns: { id: true, name: true } },
        receivedBy: { columns: { id: true, name: true } },
        items: {
          with: {
            materialPurchaseOrderItem: {
              columns: { id: true, materialCode: true, quantityOrdered: true, unitPrice: true },
              with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
            },
          },
        },
      },
    });

    if (!receipt)
      throw new NotFoundException(
        translate(`Material purchase receipt with ID ${id} does not exist.`, `لا يوجد إذن استلام مواد بالمعرف ${id}.`),
      );

    return receipt;
  }
}
