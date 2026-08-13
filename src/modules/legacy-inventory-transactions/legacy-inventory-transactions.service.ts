import { and, eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { legacyInventoryTransactionItems, legacyInventoryTransactions } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateLegacyInventoryTransactionDto } from './dto/create-legacy-inventory-transaction.dto';
import { UpdateLegacyInventoryTransactionDto } from './dto/update-legacy-inventory-transaction.dto';
import { UpdateLegacyInventoryTransactionItemDto } from './dto/update-legacy-inventory-transaction-item.dto';

@Injectable()
export class LegacyInventoryTransactionsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createDto: CreateLegacyInventoryTransactionDto, user: User) {
    const { items, ...header } = createDto;

    return await this.db.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(legacyInventoryTransactions)
        .values({
          ...header,
          date: new Date(header.date),
          issueOrderDate: new Date(header.issueOrderDate),
          createdBy: user.id,
        })
        .returning();

      const insertedItems = await tx
        .insert(legacyInventoryTransactionItems)
        .values(items.map((item) => ({ ...item, legacyTransactionId: transaction.id })))
        .returning();

      return { ...transaction, items: insertedItems };
    });
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(legacyInventoryTransactions, queryParams, {
      filtering: true,
      searchableFields: ['issuePermitNumber', 'issueOrderNumber', 'contractNumber', 'workOrderNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async get(id: string) {
    const transaction = await this.db.query.legacyInventoryTransactions.findFirst({
      where: eq(legacyInventoryTransactions.id, id),
      with: {
        creator: { columns: { id: true, name: true } },
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
              },
            },
          },
        },
      },
    });

    if (!transaction)
      throw new NotFoundException(
        translate(`Legacy inventory transaction with ID ${id} does not exist.`, `لا يوجد أذن صرف مرحلي بالمعرف ${id}.`),
      );

    return transaction;
  }

  public async updateHeader(id: string, updateDto: UpdateLegacyInventoryTransactionDto) {
    const { date, issueOrderDate, ...rest } = updateDto;

    const [updated] = await this.db
      .update(legacyInventoryTransactions)
      .set({
        ...rest,
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(issueOrderDate !== undefined ? { issueOrderDate: new Date(issueOrderDate) } : {}),
      })
      .where(eq(legacyInventoryTransactions.id, id))
      .returning();

    if (!updated)
      throw new NotFoundException(
        translate(`Legacy inventory transaction with ID ${id} does not exist.`, `لا يوجد أذن صرف مرحلي بالمعرف ${id}.`),
      );

    return updated;
  }

  public async updateItem(transactionId: string, itemId: string, updateDto: UpdateLegacyInventoryTransactionItemDto) {
    const existing = await this.db.query.legacyInventoryTransactionItems.findFirst({
      where: and(
        eq(legacyInventoryTransactionItems.id, itemId),
        eq(legacyInventoryTransactionItems.legacyTransactionId, transactionId),
      ),
      columns: { id: true },
    });

    if (!existing)
      throw new NotFoundException(
        translate(
          `Legacy inventory transaction item with ID ${itemId} does not exist for transaction ${transactionId}.`,
          `لا يوجد بند أذن صرف مرحلي بالمعرف ${itemId} للمعاملة ${transactionId}.`,
        ),
      );

    const [updated] = await this.db
      .update(legacyInventoryTransactionItems)
      .set(updateDto)
      .where(eq(legacyInventoryTransactionItems.id, itemId))
      .returning();

    return updated;
  }
}
