import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { inventoryTransactions } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(inventoryTransactions, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async get(id: string) {
    const transaction = await this.db.query.inventoryTransactions.findFirst({
      where: eq(inventoryTransactions.id, id),
      with: {
        createdBy: { columns: { id: true, name: true } },
        items: {
          with: {
            material: {
              columns: {
                code: true,
                title: true,
                materialType: true,
                unitOfMeasurement: true,
                unitPrice: true,
              },
            },
          },
        },
      },
    });

    if (!transaction)
      throw new NotFoundException(
        translate(
          `Inventory transaction with ID ${id} does not exist.`,
          `لا توجد حركة مخزون بالمعرف ${id}.`,
        ),
      );

    return transaction;
  }
}
