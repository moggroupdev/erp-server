import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItems,
  requestForQuotationItems,
  requestForQuotations,
  supplierQuotationItems,
  supplierQuotations,
  suppliers,
} from 'src/database/schema';
import { QueryParams, User, type MaterialUnit } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateRequestForQuotationDto } from './dto/create-request-for-quotation.dto';
import { CreateRequestForQuotationItemDto } from './dto/create-request-for-quotation-item.dto';
import { UpdateRequestForQuotationDto } from './dto/update-request-for-quotation.dto';
import { UpdateRequestForQuotationItemDto } from './dto/update-request-for-quotation-item.dto';
import { CreateSupplierQuotationDto } from './dto/create-supplier-quotation.dto';
import { UpdateSupplierQuotationDto } from './dto/update-supplier-quotation.dto';
import { CreateSupplierQuotationItemDto } from './dto/create-supplier-quotation-item.dto';
import { UpdateSupplierQuotationItemDto } from './dto/update-supplier-quotation-item.dto';

const USER_COLUMNS = { id: true, name: true } as const;
const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

type RfqRow = typeof requestForQuotations.$inferSelect;

@Injectable()
export class RequestForQuotationsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
    private materialUnitValidationService: MaterialUnitValidationService,
  ) {}

  public async create(createDto: CreateRequestForQuotationDto, user: User) {
    const { items, ...header } = createDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.materialUnitValidationService.assertValidSelectedUnits(items);

    return await this.db.transaction(async (tx) => {
      const [rfq] = await tx
        .insert(requestForQuotations)
        .values({
          code: sql`DEFAULT`,
          notes: header.notes,
          createdBy: user.id,
        })
        .returning();

      const insertedItems = await tx
        .insert(requestForQuotationItems)
        .values(
          items.map((item) => ({
            requestForQuotationId: rfq.id,
            materialCode: item.materialCode,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            quantityRequested: item.quantityRequested,
            notes: item.notes,
          })),
        )
        .returning();

      return { ...rfq, items: insertedItems };
    });
  }

  public async list(queryParams: QueryParams) {
    const status = typeof queryParams.status === 'string' ? queryParams.status : undefined;
    const statusCondition = this.statusCondition(status);

    return await this.queryBuilderService.execute(requestForQuotations, queryParams, {
      filtering: true,
      searchableFields: ['code', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions: statusCondition ? [statusCondition] : undefined,
      withRelations: { createdBy: { columns: USER_COLUMNS } },
    });
  }

  public async get(id: string) {
    const rfq = await this.db.query.requestForQuotations.findFirst({
      where: eq(requestForQuotations.id, id),
      with: {
        createdBy: { columns: USER_COLUMNS },
        items: {
          with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
        },
        supplierQuotations: {
          with: {
            supplier: { columns: { id: true, name: true } },
            createdBy: { columns: USER_COLUMNS },
            items: true,
          },
        },
      },
    });

    if (!rfq) this.throwRfqNotFound(id);

    return {
      ...rfq,
      items: rfq.items.map((item) => ({
        ...item,
        quantityRequested: Number(item.quantityRequested),
      })),
      supplierQuotations: rfq.supplierQuotations.map((quotation) => ({
        ...quotation,
        items: quotation.items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
        })),
      })),
    };
  }

  /** Quotation lines for one supplier, used when linking a purchase order. */
  public async listQuotationItems(supplierId?: string, materialCode?: string) {
    const trimmedSupplierId = supplierId?.trim();
    if (!trimmedSupplierId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmedSupplierId)) {
      throw new BadRequestException(translate('A supplier id is required.', 'معرف المورد مطلوب.'));
    }

    const trimmedCode = materialCode?.trim() || undefined;

    const rows = await this.db
      .select({
        id: supplierQuotationItems.id,
        materialCode: supplierQuotationItems.materialCode,
        unitOfMeasurementSelected: supplierQuotationItems.unitOfMeasurementSelected,
        unitPrice: supplierQuotationItems.unitPrice,
        requestForQuotationId: requestForQuotations.id,
        requestForQuotationCode: requestForQuotations.code,
        requestForQuotationItemId: requestForQuotationItems.id,
        quantityRequested: requestForQuotationItems.quantityRequested,
        requestedUnit: requestForQuotationItems.unitOfMeasurementSelected,
      })
      .from(supplierQuotationItems)
      .innerJoin(supplierQuotations, eq(supplierQuotationItems.supplierQuotationId, supplierQuotations.id))
      .innerJoin(requestForQuotations, eq(supplierQuotations.requestForQuotationId, requestForQuotations.id))
      .innerJoin(requestForQuotationItems, eq(supplierQuotationItems.requestForQuotationItemId, requestForQuotationItems.id))
      .where(
        and(
          eq(supplierQuotations.supplierId, trimmedSupplierId),
          trimmedCode ? eq(supplierQuotationItems.materialCode, trimmedCode) : undefined,
        ),
      );

    return rows.map((row) => ({
      ...row,
      unitPrice: Number(row.unitPrice),
      quantityRequested: Number(row.quantityRequested),
      unitOfMeasurementSelected: row.unitOfMeasurementSelected as MaterialUnit,
      requestedUnit: row.requestedUnit as MaterialUnit,
    }));
  }

  public async updateHeader(id: string, updateDto: UpdateRequestForQuotationDto) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);

    const [updated] = await this.db
      .update(requestForQuotations)
      .set(updateDto)
      .where(eq(requestForQuotations.id, id))
      .returning();

    return updated;
  }

  public async addItem(id: string, createDto: CreateRequestForQuotationItemDto) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.materialUnitValidationService.assertValidSelectedUnits([createDto]);
    await this.assertMaterialNotOnRfq(id, createDto.materialCode);

    const [inserted] = await this.db
      .insert(requestForQuotationItems)
      .values({
        requestForQuotationId: id,
        materialCode: createDto.materialCode,
        unitOfMeasurementSelected: createDto.unitOfMeasurementSelected,
        quantityRequested: createDto.quantityRequested,
        notes: createDto.notes,
      })
      .returning();

    return inserted;
  }

  public async updateItem(id: string, itemId: string, updateDto: UpdateRequestForQuotationItemDto) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    const item = await this.requireItem(id, itemId);

    if (updateDto.materialCode && updateDto.materialCode !== item.materialCode) {
      await this.assertRfqItemHasNoQuotationLines(itemId);
      await this.assertMaterialNotOnRfq(id, updateDto.materialCode);
    }

    const materialCode = updateDto.materialCode ?? item.materialCode;
    const unitOfMeasurementSelected = updateDto.unitOfMeasurementSelected ?? item.unitOfMeasurementSelected;
    await this.materialUnitValidationService.assertValidSelectedUnits([{ materialCode, unitOfMeasurementSelected }]);

    const [updated] = await this.db
      .update(requestForQuotationItems)
      .set(updateDto)
      .where(eq(requestForQuotationItems.id, itemId))
      .returning();

    return updated;
  }

  public async deleteItem(id: string, itemId: string) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.requireItem(id, itemId);
    await this.assertRfqItemHasNoQuotationLines(itemId);

    await this.db.delete(requestForQuotationItems).where(eq(requestForQuotationItems.id, itemId));
    return { id: itemId };
  }

  public async close(id: string) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);

    const [updated] = await this.db
      .update(requestForQuotations)
      .set({ closedAt: new Date() })
      .where(eq(requestForQuotations.id, id))
      .returning();

    return updated;
  }

  public async cancel(id: string) {
    const rfq = await this.requireRfq(id);
    if (rfq.cancelledAt) {
      throw new BadRequestException(translate('This request is already cancelled.', 'هذا الطلب ملغى بالفعل.'));
    }
    if (rfq.closedAt) {
      throw new BadRequestException(
        translate('A closed request cannot be cancelled.', 'لا يمكن إلغاء طلب مغلق.'),
      );
    }

    const [updated] = await this.db
      .update(requestForQuotations)
      .set({ cancelledAt: new Date() })
      .where(eq(requestForQuotations.id, id))
      .returning();

    return updated;
  }

  public async inviteSupplier(id: string, createDto: CreateSupplierQuotationDto, user: User) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.assertSupplierExists(createDto.supplierId);

    const existing = await this.db.query.supplierQuotations.findFirst({
      where: and(
        eq(supplierQuotations.requestForQuotationId, id),
        eq(supplierQuotations.supplierId, createDto.supplierId),
      ),
      columns: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        translate('This supplier is already on the request.', 'هذا المورد مضاف إلى الطلب بالفعل.'),
      );
    }

    const [inserted] = await this.db
      .insert(supplierQuotations)
      .values({
        requestForQuotationId: id,
        supplierId: createDto.supplierId,
        createdBy: user.id,
      })
      .returning();

    return inserted;
  }

  public async updateQuotation(id: string, quotationId: string, updateDto: UpdateSupplierQuotationDto) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.requireQuotation(id, quotationId);

    const [updated] = await this.db
      .update(supplierQuotations)
      .set({
        ...updateDto,
        validUntil:
          updateDto.validUntil === undefined ? undefined : updateDto.validUntil ? new Date(updateDto.validUntil) : null,
      })
      .where(eq(supplierQuotations.id, quotationId))
      .returning();

    return updated;
  }

  public async addQuotationItem(id: string, quotationId: string, createDto: CreateSupplierQuotationItemDto) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.requireQuotation(id, quotationId);

    const rfqItem = await this.requireRfqItemOnRfq(id, createDto.requestForQuotationItemId);
    await this.materialUnitValidationService.assertValidSelectedUnits([
      { materialCode: rfqItem.materialCode, unitOfMeasurementSelected: createDto.unitOfMeasurementSelected },
    ]);

    const duplicate = await this.db.query.supplierQuotationItems.findFirst({
      where: and(
        eq(supplierQuotationItems.supplierQuotationId, quotationId),
        eq(supplierQuotationItems.requestForQuotationItemId, createDto.requestForQuotationItemId),
      ),
      columns: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        translate('This material is already priced on the quotation.', 'هذه المادة مسعّرة بالفعل في عرض السعر.'),
      );
    }

    const [inserted] = await this.db
      .insert(supplierQuotationItems)
      .values({
        supplierQuotationId: quotationId,
        requestForQuotationItemId: rfqItem.id,
        requestForQuotationId: id,
        materialCode: rfqItem.materialCode,
        unitOfMeasurementSelected: createDto.unitOfMeasurementSelected,
        unitPrice: createDto.unitPrice,
        notes: createDto.notes,
      })
      .returning();

    return { ...inserted, unitPrice: Number(inserted.unitPrice) };
  }

  public async updateQuotationItem(
    id: string,
    quotationId: string,
    itemId: string,
    updateDto: UpdateSupplierQuotationItemDto,
  ) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.requireQuotation(id, quotationId);
    const item = await this.requireQuotationItem(quotationId, itemId);

    const unit = updateDto.unitOfMeasurementSelected ?? item.unitOfMeasurementSelected;
    await this.materialUnitValidationService.assertValidSelectedUnits([
      { materialCode: item.materialCode, unitOfMeasurementSelected: unit },
    ]);

    const [updated] = await this.db
      .update(supplierQuotationItems)
      .set(updateDto)
      .where(eq(supplierQuotationItems.id, itemId))
      .returning();

    return { ...updated, unitPrice: Number(updated.unitPrice) };
  }

  public async deleteQuotationItem(id: string, quotationId: string, itemId: string) {
    const rfq = await this.requireRfq(id);
    this.assertOpen(rfq);
    await this.requireQuotation(id, quotationId);
    await this.requireQuotationItem(quotationId, itemId);

    const linked = await this.db.query.materialPurchaseOrderItems.findFirst({
      where: eq(materialPurchaseOrderItems.supplierQuotationItemId, itemId),
      columns: { id: true },
    });
    if (linked) {
      throw new ConflictException(
        translate(
          'This quotation line is linked to a purchase order and cannot be removed.',
          'بند عرض السعر هذا مرتبط بأمر توريد ولا يمكن حذفه.',
        ),
      );
    }

    await this.db.delete(supplierQuotationItems).where(eq(supplierQuotationItems.id, itemId));
    return { id: itemId };
  }

  // ============================== PRIVATE ==============================

  private statusCondition(status: string | undefined): SQL | undefined {
    if (!status) return undefined;
    if (status === 'open') {
      return and(isNull(requestForQuotations.closedAt), isNull(requestForQuotations.cancelledAt));
    }
    if (status === 'closed') return isNotNull(requestForQuotations.closedAt);
    if (status === 'cancelled') return isNotNull(requestForQuotations.cancelledAt);
    throw new BadRequestException(translate('Unknown request status.', 'حالة الطلب غير معروفة.'));
  }

  private async requireRfq(id: string) {
    const rfq = await this.db.query.requestForQuotations.findFirst({
      where: eq(requestForQuotations.id, id),
    });
    if (!rfq) this.throwRfqNotFound(id);
    return rfq;
  }

  private async requireItem(rfqId: string, itemId: string) {
    const item = await this.db.query.requestForQuotationItems.findFirst({
      where: and(eq(requestForQuotationItems.id, itemId), eq(requestForQuotationItems.requestForQuotationId, rfqId)),
    });
    if (!item) {
      throw new NotFoundException(translate('Request line not found.', 'بند الطلب غير موجود.'));
    }
    return item;
  }

  private async requireQuotation(rfqId: string, quotationId: string) {
    const quotation = await this.db.query.supplierQuotations.findFirst({
      where: and(eq(supplierQuotations.id, quotationId), eq(supplierQuotations.requestForQuotationId, rfqId)),
    });
    if (!quotation) {
      throw new NotFoundException(translate('Supplier quotation not found.', 'عرض سعر المورد غير موجود.'));
    }
    return quotation;
  }

  private async requireQuotationItem(quotationId: string, itemId: string) {
    const item = await this.db.query.supplierQuotationItems.findFirst({
      where: and(eq(supplierQuotationItems.id, itemId), eq(supplierQuotationItems.supplierQuotationId, quotationId)),
    });
    if (!item) {
      throw new NotFoundException(translate('Quotation line not found.', 'بند عرض السعر غير موجود.'));
    }
    return item;
  }

  private async requireRfqItemOnRfq(rfqId: string, itemId: string) {
    return this.requireItem(rfqId, itemId);
  }

  private assertOpen(rfq: RfqRow) {
    if (rfq.closedAt || rfq.cancelledAt) {
      throw new BadRequestException(
        translate('A closed or cancelled request cannot be changed.', 'لا يمكن تعديل طلب مغلق أو ملغى.'),
      );
    }
  }

  private assertNoDuplicateMaterials(materialCodes: string[]) {
    const seen = new Set<string>();
    for (const code of materialCodes) {
      if (seen.has(code)) {
        throw new BadRequestException(
          translate(`Material ${code} is listed more than once.`, `المادة ${code} مكررة في الطلب.`),
        );
      }
      seen.add(code);
    }
  }

  private async assertMaterialNotOnRfq(rfqId: string, materialCode: string) {
    const existing = await this.db.query.requestForQuotationItems.findFirst({
      where: and(
        eq(requestForQuotationItems.requestForQuotationId, rfqId),
        eq(requestForQuotationItems.materialCode, materialCode),
      ),
      columns: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        translate(`Material ${materialCode} is already on this request.`, `المادة ${materialCode} موجودة بالفعل في هذا الطلب.`),
      );
    }
  }

  private async assertSupplierExists(supplierId: string) {
    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplierId),
      columns: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException(
        translate(`Supplier with ID ${supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${supplierId}.`),
      );
    }
  }

  private async assertRfqItemHasNoQuotationLines(itemId: string) {
    const linked = await this.db.query.supplierQuotationItems.findFirst({
      where: eq(supplierQuotationItems.requestForQuotationItemId, itemId),
      columns: { id: true },
    });
    if (linked) {
      throw new ConflictException(
        translate(
          'This material is priced on a supplier quotation and cannot be changed or removed.',
          'هذه المادة مسعّرة في عرض مورد ولا يمكن تغييرها أو حذفها.',
        ),
      );
    }
  }

  private throwRfqNotFound(id: string): never {
    throw new NotFoundException(
      translate(`Request for quotation with ID ${id} does not exist.`, `لا يوجد طلب عرض سعر بالمعرف ${id}.`),
    );
  }
}
