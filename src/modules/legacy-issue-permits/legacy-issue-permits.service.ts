import { and, asc, desc, eq, gte, isNotNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { customers, legacyIssuePermitItems, legacyIssuePermits, materials } from 'src/database/schema';
import { QueryParams, User, type LegacyIssuePermitType } from 'src/utils/types';
import { LEGACY_ISSUE_PERMIT_TYPES } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateLegacyIssuePermitDto } from './dto/create-legacy-issue-permit.dto';
import { CreateLegacyIssuePermitItemDto } from './dto/create-legacy-issue-permit-item.dto';
import { UpdateLegacyIssuePermitDto } from './dto/update-legacy-issue-permit.dto';
import { UpdateLegacyIssuePermitItemDto } from './dto/update-legacy-issue-permit-item.dto';
import { ReorderLegacyIssuePermitItemsDto } from './dto/reorder-legacy-issue-permit-items.dto';
import { ListNotedItemsQueryDto } from './dto/list-noted-items-query.dto';

const SST_SUFFIX_RE = /-\d+$/;

type PermitHeaderFields = {
  permitType: LegacyIssuePermitType;
  issueOrderNumber?: string | null;
  issueOrderDate?: string | Date | null;
  productionSubDepartment?: string | null;
  contractNumber?: string | null;
  maintenanceOrderNumber?: string | null;
  maintenanceOrderType?: string | null;
  customerId?: string | null;
  hasMultipleCustomers?: boolean;
};

type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

@Injectable()
export class LegacyIssuePermitsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createDto: CreateLegacyIssuePermitDto, user: User) {
    const { items, ...header } = createDto;
    const isSst = header.isSst ?? false;

    await this.assertPermitHeader(header);

    return await this.db.transaction(async (tx) => {
      const issuePermitNumber = await this.resolveIssuePermitNumber(tx, {
        paperNumber: header.issuePermitNumber,
        isSst,
      });

      const [transaction] = await tx
        .insert(legacyIssuePermits)
        .values({
          ...header,
          issuePermitNumber,
          isSst,
          date: new Date(header.date),
          issueOrderDate: header.issueOrderDate ? new Date(header.issueOrderDate) : null,
          hasMultipleCustomers: header.hasMultipleCustomers ?? false,
          createdBy: user.id,
        })
        .returning();

      if (items.length === 0) {
        return { ...transaction, items: [] };
      }

      for (const item of items) this.assertMaterialRequiresUnitAndQuantity(item);

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
      searchableFields: [
        'issuePermitNumber',
        'issueOrderNumber',
        'contractNumber',
        'maintenanceOrderNumber',
        'notes',
      ],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async listNotedItems(query: ListNotedItemsQueryDto) {
    const dateRange = this.buildInclusiveCalendarDateRange(query.from, query.to);
    if (dateRange.from && dateRange.to && dateRange.from > dateRange.to) {
      throw new BadRequestException(
        translate('The start date must be on or before the end date.', 'يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساوياً له.'),
      );
    }

    const conditions: SQL[] = [
      isNotNull(legacyIssuePermitItems.notes),
      ne(sql`btrim(${legacyIssuePermitItems.notes})`, ''),
    ];

    if (dateRange.from) conditions.push(gte(legacyIssuePermits.date, dateRange.from));
    if (dateRange.to) conditions.push(lte(legacyIssuePermits.date, dateRange.to));
    if (query.permitType) conditions.push(eq(legacyIssuePermits.permitType, query.permitType));
    if (query.productionSubDepartment) {
      conditions.push(eq(legacyIssuePermits.productionSubDepartment, query.productionSubDepartment));
    }
    if (query.isSst !== undefined) conditions.push(eq(legacyIssuePermits.isSst, query.isSst));
    if (query.isCancelled !== undefined) conditions.push(eq(legacyIssuePermits.isCancelled, query.isCancelled));
    if (query.customerId) conditions.push(eq(legacyIssuePermits.customerId, query.customerId));
    if (query.creatorId) conditions.push(eq(legacyIssuePermits.creatorId, query.creatorId));

    const rows = await this.db
      .select({
        itemId: legacyIssuePermitItems.id,
        sequenceOrder: legacyIssuePermitItems.sequenceOrder,
        notes: legacyIssuePermitItems.notes,
        materialCode: legacyIssuePermitItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurementSelected: legacyIssuePermitItems.unitOfMeasurementSelected,
        quantity: legacyIssuePermitItems.quantity,
        issuePermitId: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        date: legacyIssuePermits.date,
        isSst: legacyIssuePermits.isSst,
        isCancelled: legacyIssuePermits.isCancelled,
        permitType: legacyIssuePermits.permitType,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .leftJoin(materials, eq(legacyIssuePermitItems.materialCode, materials.code))
      .where(and(...conditions))
      .orderBy(
        desc(legacyIssuePermits.date),
        desc(legacyIssuePermits.issuePermitNumber),
        asc(legacyIssuePermitItems.sequenceOrder),
      );

    return rows.map((row) => ({
      itemId: row.itemId,
      sequenceOrder: row.sequenceOrder,
      notes: row.notes!,
      materialCode: row.materialCode,
      materialTitle: row.materialTitle,
      unitOfMeasurementSelected: row.unitOfMeasurementSelected,
      quantity: row.quantity == null ? null : Number(row.quantity),
      issuePermitId: row.issuePermitId,
      issuePermitNumber: row.issuePermitNumber,
      date: row.date,
      isSst: row.isSst,
      isCancelled: row.isCancelled,
      permitType: row.permitType,
    }));
  }

  public async getNeighbors(id: string, queryParams: QueryParams) {
    const existing = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, id),
      columns: { id: true },
    });

    if (!existing)
      throw new NotFoundException(
        translate(`Legacy issue permit with ID ${id} does not exist.`, `لا يوجد إذن صرف مرحلي بالمعرف ${id}.`),
      );

    return await this.queryBuilderService.findNeighbors<{
      id: string;
      issuePermitNumber: string;
      isSst: boolean;
    }>(legacyIssuePermits, id, { keyword: queryParams.keyword, sortBy: queryParams.sortBy }, {
      searchableFields: [
        'issuePermitNumber',
        'issueOrderNumber',
        'contractNumber',
        'maintenanceOrderNumber',
        'notes',
      ],
      select: {
        id: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        isSst: legacyIssuePermits.isSst,
      },
    });
  }

  public async get(id: string) {
    const transaction = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, id),
      with: {
        creator: { columns: { id: true, name: true } },
        createdBy: { columns: { id: true, name: true } },
        customer: { columns: { id: true, code: true, name: true } },
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
        translate(`Legacy issue permit with ID ${id} does not exist.`, `لا يوجد إذن صرف مرحلي بالمعرف ${id}.`),
      );

    return transaction;
  }

  public async updateHeader(id: string, updateDto: UpdateLegacyIssuePermitDto) {
    const existing = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, id),
    });

    if (!existing)
      throw new NotFoundException(
        translate(`Legacy issue permit with ID ${id} does not exist.`, `لا يوجد إذن صرف مرحلي بالمعرف ${id}.`),
      );

    const { date, issueOrderDate, ...rest } = updateDto;
    const merged: PermitHeaderFields = {
      permitType: (rest.permitType ?? existing.permitType) as LegacyIssuePermitType,
      issueOrderNumber: rest.issueOrderNumber !== undefined ? rest.issueOrderNumber : existing.issueOrderNumber,
      issueOrderDate: issueOrderDate !== undefined ? issueOrderDate : existing.issueOrderDate,
      productionSubDepartment:
        rest.productionSubDepartment !== undefined
          ? rest.productionSubDepartment
          : existing.productionSubDepartment,
      contractNumber: rest.contractNumber !== undefined ? rest.contractNumber : existing.contractNumber,
      maintenanceOrderNumber:
        rest.maintenanceOrderNumber !== undefined ? rest.maintenanceOrderNumber : existing.maintenanceOrderNumber,
      maintenanceOrderType:
        rest.maintenanceOrderType !== undefined ? rest.maintenanceOrderType : existing.maintenanceOrderType,
      customerId: rest.customerId !== undefined ? rest.customerId : existing.customerId,
      hasMultipleCustomers:
        rest.hasMultipleCustomers !== undefined ? rest.hasMultipleCustomers : existing.hasMultipleCustomers,
    };

    await this.assertPermitHeader(merged);

    const nextIsSst = rest.isSst !== undefined ? rest.isSst : existing.isSst;
    const paperNumber =
      rest.issuePermitNumber !== undefined
        ? rest.issuePermitNumber
        : existing.isSst
          ? this.stripSstSuffix(existing.issuePermitNumber)
          : existing.issuePermitNumber;

    return await this.db.transaction(async (tx) => {
      const issuePermitNumber = await this.resolveIssuePermitNumber(tx, {
        paperNumber,
        isSst: nextIsSst,
        existing: {
          id: existing.id,
          issuePermitNumber: existing.issuePermitNumber,
          isSst: existing.isSst,
        },
      });

      const [updated] = await tx
        .update(legacyIssuePermits)
        .set({
          ...rest,
          issuePermitNumber,
          isSst: nextIsSst,
          ...(date !== undefined ? { date: new Date(date) } : {}),
          ...(issueOrderDate !== undefined
            ? { issueOrderDate: issueOrderDate ? new Date(issueOrderDate) : null }
            : {}),
        })
        .where(eq(legacyIssuePermits.id, id))
        .returning();

      return updated;
    });
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
          `لا يوجد إذن صرف مرحلي بالمعرف ${transactionId}.`,
        ),
      );

    this.assertMaterialRequiresUnitAndQuantity(createDto);

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

  public async reorderItems(transactionId: string, reorderDto: ReorderLegacyIssuePermitItemsDto) {
    const { itemIds } = reorderDto;

    const transaction = await this.db.query.legacyIssuePermits.findFirst({
      where: eq(legacyIssuePermits.id, transactionId),
      columns: { id: true },
    });

    if (!transaction)
      throw new NotFoundException(
        translate(
          `Legacy issue permit with ID ${transactionId} does not exist.`,
          `لا يوجد إذن صرف مرحلي بالمعرف ${transactionId}.`,
        ),
      );

    const existing = await this.db.query.legacyIssuePermitItems.findMany({
      where: eq(legacyIssuePermitItems.issuePermitId, transactionId),
      columns: { id: true },
    });

    if (existing.length === 0)
      throw new BadRequestException(
        translate(
          `Legacy issue permit with ID ${transactionId} has no items to reorder.`,
          `لا توجد بنود لإعادة ترتيبها لإذن الصرف المرحلي بالمعرف ${transactionId}.`,
        ),
      );

    if (new Set(itemIds).size !== itemIds.length)
      throw new BadRequestException(
        translate(
          'Item IDs in the reorder payload must be unique.',
          'يجب أن تكون معرفات البنود في طلب إعادة الترتيب فريدة.',
        ),
      );

    const existingIds = new Set(existing.map((item) => item.id));
    if (itemIds.length !== existing.length || itemIds.some((id) => !existingIds.has(id)))
      throw new BadRequestException(
        translate(
          'Reorder payload must include every item of this permit exactly once.',
          'يجب أن يتضمن طلب إعادة الترتيب كل بنود هذا الإذن مرة واحدة فقط.',
        ),
      );

    return await this.db.transaction(async (tx) => {
      await tx
        .update(legacyIssuePermitItems)
        .set({ sequenceOrder: sql`${legacyIssuePermitItems.sequenceOrder} + 1000000` })
        .where(eq(legacyIssuePermitItems.issuePermitId, transactionId));

      const updated: (typeof legacyIssuePermitItems.$inferSelect)[] = [];
      for (const [index, itemId] of itemIds.entries()) {
        const [row] = await tx
          .update(legacyIssuePermitItems)
          .set({ sequenceOrder: index + 1 })
          .where(and(eq(legacyIssuePermitItems.id, itemId), eq(legacyIssuePermitItems.issuePermitId, transactionId)))
          .returning();
        updated.push(row);
      }

      return updated.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    });
  }

  public async updateItem(transactionId: string, itemId: string, updateDto: UpdateLegacyIssuePermitItemDto) {
    const existing = await this.db.query.legacyIssuePermitItems.findFirst({
      where: and(eq(legacyIssuePermitItems.id, itemId), eq(legacyIssuePermitItems.issuePermitId, transactionId)),
    });

    if (!existing)
      throw new NotFoundException(
        translate(
          `Legacy issue permit item with ID ${itemId} does not exist for transaction ${transactionId}.`,
          `لا يوجد بند إذن صرف مرحلي بالمعرف ${itemId} للمعاملة ${transactionId}.`,
        ),
      );

    const nextItem = { ...existing, ...updateDto };
    this.assertMaterialRequiresUnitAndQuantity(nextItem);

    const [updated] = await this.db
      .update(legacyIssuePermitItems)
      .set(updateDto)
      .where(eq(legacyIssuePermitItems.id, itemId))
      .returning();

    return updated;
  }

  public async deleteItem(transactionId: string, itemId: string) {
    const existing = await this.db.query.legacyIssuePermitItems.findFirst({
      where: and(eq(legacyIssuePermitItems.id, itemId), eq(legacyIssuePermitItems.issuePermitId, transactionId)),
      columns: { id: true },
    });

    if (!existing)
      throw new NotFoundException(
        translate(
          `Legacy issue permit item with ID ${itemId} does not exist for transaction ${transactionId}.`,
          `لا يوجد بند إذن صرف مرحلي بالمعرف ${itemId} للمعاملة ${transactionId}.`,
        ),
      );

    const [deleted] = await this.db
      .delete(legacyIssuePermitItems)
      .where(and(eq(legacyIssuePermitItems.id, itemId), eq(legacyIssuePermitItems.issuePermitId, transactionId)))
      .returning();

    return deleted;
  }

  // ============================== PRIVATE METHODS ==============================

  private stripSstSuffix(storedNumber: string) {
    return storedNumber.replace(SST_SUFFIX_RE, '');
  }

  private assertPaperNumberHasNoSuffix(paperNumber: string) {
    if (SST_SUFFIX_RE.test(paperNumber)) {
      throw new BadRequestException(
        translate(
          'SST permit numbers must be entered without a -N suffix. The system assigns the suffix automatically.',
          'يجب إدخال رقم إذن صرف SST بدون لاحقة -N. النظام يعيّن اللاحقة تلقائياً.',
        ),
      );
    }
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async resolveIssuePermitNumber(
    tx: Tx,
    params: {
      paperNumber: string;
      isSst: boolean;
      existing?: { id: string; issuePermitNumber: string; isSst: boolean };
    },
  ) {
    const paperNumber = params.paperNumber.trim();
    if (!paperNumber) {
      throw new BadRequestException(
        translate('Issue permit number is required.', 'رقم إذن الصرف مطلوب.'),
      );
    }

    if (!params.isSst) {
      await this.assertNormalNumberAvailable(tx, paperNumber, params.existing?.id);
      return paperNumber;
    }

    this.assertPaperNumberHasNoSuffix(paperNumber);

    if (
      params.existing?.isSst &&
      this.stripSstSuffix(params.existing.issuePermitNumber) === paperNumber
    ) {
      return params.existing.issuePermitNumber;
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('legacy_issue_permit_sst'), hashtext(${paperNumber}))`,
    );

    const escaped = this.escapeRegex(paperNumber);
    const suffixWhere = [
      eq(legacyIssuePermits.isSst, true),
      sql`${legacyIssuePermits.issuePermitNumber} ~ ${'^' + escaped + '-[0-9]+$'}`,
    ];
    if (params.existing) suffixWhere.push(ne(legacyIssuePermits.id, params.existing.id));

    const [row] = await tx
      .select({
        maxSuffix: sql<number>`coalesce(max(substring(${legacyIssuePermits.issuePermitNumber} from '.*-([0-9]+)$')::int), 0)`,
      })
      .from(legacyIssuePermits)
      .where(and(...suffixWhere));

    return `${paperNumber}-${Number(row?.maxSuffix ?? 0) + 1}`;
  }

  private async assertNormalNumberAvailable(tx: Tx, paperNumber: string, excludeId?: string) {
    const clashWhere = [
      eq(legacyIssuePermits.issuePermitNumber, paperNumber),
      eq(legacyIssuePermits.isSst, false),
    ];
    if (excludeId) clashWhere.push(ne(legacyIssuePermits.id, excludeId));

    const clash = await tx.query.legacyIssuePermits.findFirst({
      where: and(...clashWhere),
      columns: { id: true },
    });

    if (clash) {
      throw new ConflictException(
        translate(
          `A normal issue permit with number ${paperNumber} already exists.`,
          `يوجد إذن صرف عادي برقم ${paperNumber} بالفعل.`,
        ),
      );
    }
  }

  private async assertPermitHeader(header: PermitHeaderFields) {
    const hasIssueOrderNumber = !!header.issueOrderNumber;
    const hasIssueOrderDate = header.issueOrderDate != null && header.issueOrderDate !== '';
    if (hasIssueOrderNumber !== hasIssueOrderDate) {
      throw new BadRequestException(
        translate(
          'Issue order number and issue order date must both be provided or both omitted.',
          'يجب إدخال رقم طلب الصرف وتاريخه معاً أو تركهما فارغين معاً.',
        ),
      );
    }

    const permitType = header.permitType;
    const productionSubDepartment = header.productionSubDepartment ?? null;
    const contractNumber = header.contractNumber ?? null;
    const maintenanceOrderNumber = header.maintenanceOrderNumber ?? null;
    const maintenanceOrderType = header.maintenanceOrderType ?? null;
    const customerId = header.customerId ?? null;
    const hasMultipleCustomers = header.hasMultipleCustomers ?? false;

    if (permitType === LEGACY_ISSUE_PERMIT_TYPES.PRODUCTION_DEPARTMENT && !productionSubDepartment) {
      throw new BadRequestException(
        translate(
          'Production department is required for production department permits.',
          'قسم الانتاج مطلوب لأذونات قسم الانتاج.',
        ),
      );
    }

    if (permitType === LEGACY_ISSUE_PERMIT_TYPES.CONTRACT_REVIEW) {
      if (maintenanceOrderNumber || maintenanceOrderType) {
        throw new BadRequestException(
          translate(
            'Maintenance order fields are not allowed for contract review permits.',
            'حقول أمر الصيانة غير مسموح بها لأذونات مراجعة العقد.',
          ),
        );
      }
    } else if (permitType === LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER) {
      if (contractNumber) {
        throw new BadRequestException(
          translate(
            'Contract review number is not allowed for maintenance order permits.',
            'رقم مراجعة العقد غير مسموح به لأذونات أمر الصيانة.',
          ),
        );
      }
    } else {
      if (contractNumber || maintenanceOrderNumber || maintenanceOrderType || customerId || hasMultipleCustomers) {
        throw new BadRequestException(
          translate(
            'Contract, maintenance, and customer fields are not allowed for this permit type.',
            'حقول العقد والصيانة والعميل غير مسموح بها لهذا النوع من الأذونات.',
          ),
        );
      }
    }

    if (hasMultipleCustomers) {
      if (customerId || contractNumber || maintenanceOrderNumber) {
        throw new BadRequestException(
          translate(
            'When multiple customers is set, customer and order numbers must be empty.',
            'عند اختيار عملاء متعددون، يجب ترك العميل وأرقام الأوامر فارغة.',
          ),
        );
      }
    }

    if (customerId) {
      const customer = await this.db.query.customers.findFirst({
        where: eq(customers.id, customerId),
        columns: { id: true },
      });
      if (!customer) {
        throw new NotFoundException(
          translate(`Customer with ID ${customerId} does not exist.`, `لا يوجد عميل بالمعرف ${customerId}.`),
        );
      }
    }
  }

  private assertMaterialRequiresUnitAndQuantity(item: {
    materialCode?: string | null;
    unitOfMeasurementSelected?: string | null;
    quantity?: number | string | null;
  }) {
    if (!item.materialCode) return;

    if (!item.unitOfMeasurementSelected) {
      throw new BadRequestException(
        translate(
          `Please select the unit for material ${item.materialCode}.`,
          `يرجى اختيار الوحدة للمادة ${item.materialCode}.`,
        ),
      );
    }

    if (item.quantity == null || item.quantity === '' || Number(item.quantity) <= 0) {
      throw new BadRequestException(
        translate(
          `Please enter a positive quantity for material ${item.materialCode}.`,
          `يرجى إدخال كمية موجبة للمادة ${item.materialCode}.`,
        ),
      );
    }
  }

  /** Calendar-day bounds so a `to` date includes timestamps later that same day. */
  private buildInclusiveCalendarDateRange(from?: string, to?: string): { from?: Date; to?: Date } {
    const fromDay = from?.slice(0, 10);
    const toDay = to?.slice(0, 10);
    return {
      from: fromDay ? new Date(`${fromDay}T00:00:00.000`) : undefined,
      to: toDay ? new Date(`${toDay}T23:59:59.999`) : undefined,
    };
  }
}
