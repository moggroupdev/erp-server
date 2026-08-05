import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialPurchaseOrders } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Injectable()
export class MaterialPurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseOrders, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyInvoiceNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: { vendor: { columns: { id: true, name: true } } },
    });
  }

  public async get(id: string) {
    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, id),
      with: {
        vendor: { columns: { id: true, name: true } },
        createdBy: { columns: { id: true, name: true } },
        items: {
          with: {
            material: {
              columns: {
                code: true,
                title: true,
                materialType: true,
                unitOfMeasurement: true,
                subCategoryId: true,
                unitPrice: true,
              },
            },
          },
        },
      },
    });

    if (!order)
      throw new NotFoundException(
        translate(`Material purchase order with ID ${id} does not exist.`, `لا يوجد أمر شراء مواد بالمعرف ${id}.`),
      );

    return order;
  }
}
