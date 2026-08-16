import { and, asc, eq, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { legacyIssuePermitItems, legacyIssuePermits } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateLegacyIssuePermitDto } from './dto/create-legacy-issue-permit.dto';
import { CreateLegacyIssuePermitItemDto } from './dto/create-legacy-issue-permit-item.dto';
import { UpdateLegacyIssuePermitDto } from './dto/update-legacy-issue-permit.dto';
import { UpdateLegacyIssuePermitItemDto } from './dto/update-legacy-issue-permit-item.dto';

@Injectable()
export class LegacyIssuePermitsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createDto: CreateLegacyIssuePermitDto, user: User) {
    const { items, ...header } = createDto;

    return await this.db.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(legacyIssuePermits)
        .values({
          ...header,
          date: new Date(header.date),
          issueOrderDate: new Date(header.issueOrderDate),
          createdBy: user.id,
        })
        .returning();

      if (items.length === 0) {
        return { ...transaction, items: [] };
      }

      const insertedItems = await tx
        .insert(legacyIssuePermitItems)
        .values(items.map((item, index) => ({ ...item, issuePermitId: transaction.id, sequenceOrder: index + 1 })))
        .returning();

      return { ...transaction, items: insertedItems };
    });
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(legacyIssuePermits, queryParams, {
      filtering: true,
      searchableFields: ['issuePermitNumber', 'issueOrderNumber', 'contractNumber', 'workOrderNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async get(id: string) {
    const transaction = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, id),
      with: {
        creator: { columns: { id: true, name: true } },
        createdBy: { columns: { id: true, name: true } },
        items: {
          orderBy: [asc(legacyIssuePermitItems.sequenceOrder)],
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
        translate(`Legacy issue permit with ID ${id} does not exist.`, `لا يوجد أذن صرف مرحلي بالمعرف ${id}.`),
      );

    return transaction;
  }

  public async updateHeader(id: string, updateDto: UpdateLegacyIssuePermitDto) {
    const { date, issueOrderDate, ...rest } = updateDto;

    const [updated] = await this.db
      .update(legacyIssuePermits)
      .set({
        ...rest,
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(issueOrderDate !== undefined ? { issueOrderDate: new Date(issueOrderDate) } : {}),
      })
      .where(eq(legacyIssuePermits.id, id))
      .returning();

    if (!updated)
      throw new NotFoundException(
        translate(`Legacy issue permit with ID ${id} does not exist.`, `لا يوجد أذن صرف مرحلي بالمعرف ${id}.`),
      );

    return updated;
  }

  public async addItem(transactionId: string, createDto: CreateLegacyIssuePermitItemDto) {
    const transaction = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, transactionId),
      columns: { id: true },
    });

    if (!transaction)
      throw new NotFoundException(
        translate(
          `Legacy issue permit with ID ${transactionId} does not exist.`,
          `لا يوجد أذن صرف مرحلي بالمعرف ${transactionId}.`,
        ),
      );

    const [seq] = await this.db
      .select({ maxSequenceOrder: sql<number>`coalesce(max(${legacyIssuePermitItems.sequenceOrder}), 0)` })
      .from(legacyIssuePermitItems)
      .where(eq(legacyIssuePermitItems.issuePermitId, transactionId));

    const [inserted] = await this.db
      .insert(legacyIssuePermitItems)
      .values({ ...createDto, issuePermitId: transactionId, sequenceOrder: Number(seq?.maxSequenceOrder ?? 0) + 1 })
      .returning();

    return inserted;
  }

  public async updateItem(transactionId: string, itemId: string, updateDto: UpdateLegacyIssuePermitItemDto) {
    const existing = await this.db.query.legacyIssuePermitItems.findFirst({
      where: and(eq(legacyIssuePermitItems.id, itemId), eq(legacyIssuePermitItems.issuePermitId, transactionId)),
      columns: { id: true },
    });

    if (!existing)
      throw new NotFoundException(
        translate(
          `Legacy issue permit item with ID ${itemId} does not exist for transaction ${transactionId}.`,
          `لا يوجد بند أذن صرف مرحلي بالمعرف ${itemId} للمعاملة ${transactionId}.`,
        ),
      );

    const [updated] = await this.db
      .update(legacyIssuePermitItems)
      .set(updateDto)
      .where(eq(legacyIssuePermitItems.id, itemId))
      .returning();

    return updated;
  }
}
