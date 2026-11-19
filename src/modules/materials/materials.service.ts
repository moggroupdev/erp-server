import { randomInt } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialCategorySubs,
  materials,
  materialUnitConversions,
  manufacturedMaterialBoms,
  productDimensions,
  productStandardBoms,
  products,
  materialPurchaseRequisitions,
  materialPurchaseRequisitionItems,
  materialPurchaseOrders,
  materialPurchaseOrderItems,
  inventoryTransactions,
  inventoryTransactionItems,
  legacyIssuePermits,
  legacyIssuePermitItems,
  maintenanceOrders,
  maintenanceOrderMaterials,
  outsourcingOrders,
  outsourcingOrderItems,
  requestForQuotations,
  requestForQuotationItems,
  supplierQuotations,
  supplierQuotationItems,
  suppliers,
} from 'src/database/schema';
import { MATERIAL_TYPES } from 'src/utils/constants';
import { type MaterialType, type QueryParams, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { CreateMaterialUnitConversionDto } from './dto/create-material-unit-conversion.dto';
import { UpdateMaterialUnitConversionDto } from './dto/update-material-unit-conversion.dto';
import { SetMaterialMarketPriceDto } from './dto/set-material-market-price.dto';
import { SetMaterialMarketManufacturingCostDto } from './dto/set-material-market-manufacturing-cost.dto';
import { SetMaterialTypeDto } from './dto/set-material-type.dto';
import { DeleteMaterialDto } from './dto/delete-material.dto';

const DELETE_IMPACT_SAMPLE_LIMIT = 10;

type MaterialDeleteReferenceGroup = {
  key: string;
  count: number;
  samples: string[];
};

type MaterialDeleteImpact = {
  code: string;
  title: string;
  materialType: MaterialType;
  alreadyDeleted: boolean;
  canHardDelete: boolean;
  totalReferenceCount: number;
  groups: MaterialDeleteReferenceGroup[];
};

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createMaterialDto: CreateMaterialDto, user: User) {
    const code = await this.generateUniqueCode();
    const [material] = await this.db
      .insert(materials)
      .values({ ...createMaterialDto, code, createdBy: user.id })
      .returning();
    return material;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materials, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyCode', 'title', 'description'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions: [isNull(materials.deletedAt)],
      extras: materialUnitConversionsExtra,
      joinFilters: {
        mainCategoryId: {
          localColumn: materials.subCategoryId,
          relatedIdColumn: materialCategorySubs.id,
          relatedTable: materialCategorySubs,
          relatedFilterColumn: materialCategorySubs.mainCategoryId,
        },
      },
    });
  }

  // We allow the `get` method to return a deleted material too
  public async get(code: string) {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, code),
      with: {
        createdBy: { columns: { id: true, name: true } },
        marketUnitPriceSetBy: { columns: { id: true, name: true } },
        marketManufacturingCostSetBy: { columns: { id: true, name: true } },
        deletedBy: { columns: { id: true, name: true } },
      },
      extras: materialUnitConversionsExtra,
    });
    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
    return material;
  }

  public async update(code: string, updateMaterialDto: UpdateMaterialDto) {
    const [updatedMaterial] = await this.db
      .update(materials)
      .set(updateMaterialDto)
      .where(and(eq(materials.code, code), isNull(materials.deletedAt)))
      .returning();
    if (!updatedMaterial)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
    return updatedMaterial;
  }

  public async setMarketPrice(code: string, dto: SetMaterialMarketPriceDto, user: User) {
    const [updatedMaterial] = await this.db
      .update(materials)
      .set({
        marketUnitPrice: dto.marketUnitPrice,
        marketUnitPriceSetAt: new Date(),
        marketUnitPriceSetBy: user.id,
      })
      .where(and(eq(materials.code, code), isNull(materials.deletedAt)))
      .returning();
    if (!updatedMaterial)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
    return updatedMaterial;
  }

  public async setMarketManufacturingCost(code: string, dto: SetMaterialMarketManufacturingCostDto, user: User) {
    const material = await this.db.query.materials.findFirst({
      where: and(eq(materials.code, code), isNull(materials.deletedAt)),
      columns: { code: true, materialType: true },
    });
    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));

    if (material.materialType !== MATERIAL_TYPES.MANUFACTURED_MATERIAL) {
      throw new BadRequestException(
        translate(
          'Market manufacturing cost can only be set on manufactured materials.',
          'تكلفة التصنيع السوقية يمكن تعيينها للمواد المصنعة فقط.',
        ),
      );
    }

    const [updatedMaterial] = await this.db
      .update(materials)
      .set({
        marketManufacturingCost: dto.marketManufacturingCost,
        marketManufacturingCostSetAt: new Date(),
        marketManufacturingCostSetBy: user.id,
      })
      .where(and(eq(materials.code, code), isNull(materials.deletedAt)))
      .returning();
    if (!updatedMaterial)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
    return updatedMaterial;
  }

  public async previewTypeChange(code: string, targetType: MaterialType) {
    const material = await this.db.query.materials.findFirst({
      where: and(eq(materials.code, code), isNull(materials.deletedAt)),
      columns: { code: true, materialType: true },
    });
    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));

    const currentType = material.materialType;

    if (currentType === targetType) {
      return {
        currentType,
        targetType,
        blocked: true,
        blockReason: translate(`Material is already of type "${targetType}".`, `المادة من النوع "${targetType}" بالفعل.`),
        affectedBomLines: [] as {
          id: string;
          productDimensionId: string;
          productCode: string;
          productTitle: string;
        }[],
      };
    }

    const enteringManufactured = targetType === MATERIAL_TYPES.MANUFACTURED_MATERIAL;
    const leavingManufactured = currentType === MATERIAL_TYPES.MANUFACTURED_MATERIAL;

    if (enteringManufactured) {
      const conflictingUsages = await this.db
        .select({ manufacturedMaterialCode: manufacturedMaterialBoms.manufacturedMaterialCode })
        .from(manufacturedMaterialBoms)
        .where(eq(manufacturedMaterialBoms.materialCode, code));

      if (conflictingUsages.length > 0) {
        const codes = [...new Set(conflictingUsages.map((row) => row.manufacturedMaterialCode))];
        return {
          currentType,
          targetType,
          blocked: true,
          blockReason: translate(
            `Cannot convert to manufactured material: used as a component in the BOM of ${codes.join(', ')}. Remove it from those BOMs first.`,
            `لا يمكن التحويل إلى مادة مصنعة: هذه المادة مستخدمة كمكون في قائمة مواد ${codes.join('، ')}. أزلها من هذه القوائم أولاً.`,
          ),
          affectedBomLines: [],
        };
      }
    }

    if (leavingManufactured) {
      const ownComponents = await this.db
        .select({ id: manufacturedMaterialBoms.id })
        .from(manufacturedMaterialBoms)
        .where(eq(manufacturedMaterialBoms.manufacturedMaterialCode, code));

      if (ownComponents.length > 0) {
        return {
          currentType,
          targetType,
          blocked: true,
          blockReason: translate(
            `This material has ${ownComponents.length} component(s) in its own BOM. Delete them first.`,
            `تحتوي هذه المادة على ${ownComponents.length} مكون في قائمة موادها. احذفها أولاً.`,
          ),
          affectedBomLines: [],
        };
      }
    }

    const affectedBomLines = await this.db
      .select({
        id: productStandardBoms.id,
        productDimensionId: productStandardBoms.productDimensionId,
        productCode: products.code,
        productTitle: products.title,
      })
      .from(productStandardBoms)
      .innerJoin(productDimensions, eq(productStandardBoms.productDimensionId, productDimensions.id))
      .innerJoin(products, eq(productDimensions.productCode, products.code))
      .where(eq(productStandardBoms.materialCode, code));

    return { currentType, targetType, blocked: false, blockReason: null, affectedBomLines };
  }

  public async setType(code: string, dto: SetMaterialTypeDto) {
    const preview = await this.previewTypeChange(code, dto.materialType);
    if (preview.blocked) throw new ConflictException(preview.blockReason!);

    const enteringManufactured = dto.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL;
    const leavingManufactured = preview.currentType === MATERIAL_TYPES.MANUFACTURED_MATERIAL;

    if (leavingManufactured && preview.affectedBomLines.length > 0 && !dto.confirmed) {
      throw new ConflictException(
        translate(
          `This change affects ${preview.affectedBomLines.length} product BOM line(s). Confirm to proceed.`,
          `يؤثر هذا التغيير على ${preview.affectedBomLines.length} بند في قوائم مواد المنتجات. أكّد للمتابعة.`,
        ),
      );
    }

    return await this.db.transaction(async (tx) => {
      const [updatedMaterial] = await tx
        .update(materials)
        .set({
          materialType: dto.materialType,
          ...(leavingManufactured
            ? {
                marketManufacturingCost: null,
                marketManufacturingCostSetAt: null,
                marketManufacturingCostSetBy: null,
              }
            : {}),
        })
        .where(and(eq(materials.code, code), isNull(materials.deletedAt)))
        .returning();

      if (!updatedMaterial)
        throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));

      if (enteringManufactured) {
        await tx
          .update(productStandardBoms)
          .set({ mmSourcingType: dto.defaultMmSourcingType })
          .where(eq(productStandardBoms.materialCode, code));
      }

      if (leavingManufactured) {
        await tx.update(productStandardBoms).set({ mmSourcingType: null }).where(eq(productStandardBoms.materialCode, code));
      }

      return updatedMaterial;
    });
  }

  // ============================== DELETE ==============================

  public async getDeleteImpact(code: string): Promise<MaterialDeleteImpact> {
    return await this.collectDeleteImpact(code);
  }

  public async delete(code: string, dto: DeleteMaterialDto, user: User) {
    if (dto.confirmationCode.trim() !== code) {
      throw new BadRequestException(
        translate(
          'Confirmation code does not match the material code.',
          'رمز التأكيد لا يطابق كود المادة.',
        ),
      );
    }

    const permanent = dto.permanent === true;

    if (permanent) {
      try {
        await this.db.transaction(async (tx) => {
          // Re-check on the same connection so the impact and DELETE stay aligned.
          const impact = await this.collectDeleteImpact(code, tx);
          if (!impact.canHardDelete) {
            throw new ConflictException(
              translate(
                `Cannot permanently delete material ${code}: it is still used in ${impact.totalReferenceCount} other place(s). Remove those links first.`,
                `لا يمكن حذف المادة ${code} نهائياً: ما زالت مستخدمة في ${impact.totalReferenceCount} موضع. أزل تلك الروابط أولاً.`,
              ),
            );
          }

          const [deleted] = await tx.delete(materials).where(eq(materials.code, code)).returning({ code: materials.code });
          if (!deleted)
            throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
        });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
        // Race: a new reference appeared between the impact check and the DELETE.
        if (this.isForeignKeyViolation(error)) {
          throw new ConflictException(
            translate(
              `Cannot permanently delete material ${code}: it is still used elsewhere.`,
              `لا يمكن حذف المادة ${code} نهائياً: ما زالت مستخدمة في مواضع أخرى.`,
            ),
          );
        }
        throw error;
      }

      return;
    }

    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, code),
      columns: { code: true, deletedAt: true },
    });
    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
    if (material.deletedAt != null) {
      throw new ConflictException(
        translate(`Material ${code} is already deleted.`, `المادة ${code} محذوفة بالفعل.`),
      );
    }

    const [softDeleted] = await this.db
      .update(materials)
      .set({ deletedAt: new Date(), deletedBy: user.id })
      .where(and(eq(materials.code, code), isNull(materials.deletedAt)))
      .returning({ code: materials.code });

    if (!softDeleted)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));
  }

  // ============================== UNIT CONVERSIONS ==============================

  public async addUnitConversion(materialCode: string, dto: CreateMaterialUnitConversionDto, user: User) {
    const material = await this.db.query.materials.findFirst({
      where: and(eq(materials.code, materialCode), isNull(materials.deletedAt)),
      columns: { code: true, unitOfMeasurement: true },
    });

    if (!material)
      throw new NotFoundException(
        translate(`Material with code ${materialCode} does not exist.`, `لا توجد مادة بالكود ${materialCode}.`),
      );

    if (dto.unit === material.unitOfMeasurement) {
      throw new BadRequestException(
        translate(
          `Unit "${dto.unit}" is already the base unit for material ${materialCode}.`,
          `الوحدة "${dto.unit}" هي بالفعل وحدة القياس الأساسية للمادة ${materialCode}.`,
        ),
      );
    }

    const [row] = await this.db
      .insert(materialUnitConversions)
      .values({
        materialCode,
        unit: dto.unit,
        conversionFactorToBase: dto.conversionFactorToBase,
        createdBy: user.id,
      })
      .returning();

    return row;
  }

  public async updateUnitConversion(materialCode: string, id: string, dto: UpdateMaterialUnitConversionDto) {
    const [row] = await this.db
      .update(materialUnitConversions)
      .set({ conversionFactorToBase: dto.conversionFactorToBase })
      .where(and(eq(materialUnitConversions.id, id), eq(materialUnitConversions.materialCode, materialCode)))
      .returning();

    if (!row)
      throw new NotFoundException(
        translate(
          `Unit conversion ${id} does not exist for material ${materialCode}.`,
          `تحويل الوحدة ${id} غير موجود للمادة ${materialCode}.`,
        ),
      );

    return row;
  }

  // ============================== PRIVATE METHODS ==============================

  /** Hardcoded material usage inventory for delete preview / hard-delete guard. Keep in sync with material FKs (see AGENTS.md → Material delete impact). */
  private async collectDeleteImpact(code: string, db: DrizzleDB = this.db): Promise<MaterialDeleteImpact> {
    const material = await db.query.materials.findFirst({
      where: eq(materials.code, code),
      columns: { code: true, title: true, materialType: true, deletedAt: true },
    });
    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));

    const [
      unitConversions,
      ownMmBomLines,
      componentOfMmBoms,
      productBomLines,
      purchaseRequisitions,
      purchaseOrders,
      inventoryTxs,
      legacyIssuePermitsGroup,
      maintenanceOrdersGroup,
      outsourcingOrdersGroup,
      rfqs,
      supplierQuotationsGroup,
    ] = await Promise.all([
      db
        .select({ label: materialUnitConversions.unit })
        .from(materialUnitConversions)
        .where(eq(materialUnitConversions.materialCode, code)),
      db
        .select({ label: manufacturedMaterialBoms.materialCode })
        .from(manufacturedMaterialBoms)
        .where(eq(manufacturedMaterialBoms.manufacturedMaterialCode, code)),
      db
        .selectDistinct({ label: manufacturedMaterialBoms.manufacturedMaterialCode })
        .from(manufacturedMaterialBoms)
        .where(eq(manufacturedMaterialBoms.materialCode, code)),
      db
        .selectDistinct({ label: products.code })
        .from(productStandardBoms)
        .innerJoin(productDimensions, eq(productStandardBoms.productDimensionId, productDimensions.id))
        .innerJoin(products, eq(productDimensions.productCode, products.code))
        .where(eq(productStandardBoms.materialCode, code)),
      db
        .selectDistinct({ label: materialPurchaseRequisitions.code })
        .from(materialPurchaseRequisitionItems)
        .innerJoin(
          materialPurchaseRequisitions,
          eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, materialPurchaseRequisitions.id),
        )
        .where(eq(materialPurchaseRequisitionItems.materialCode, code)),
      db
        .selectDistinct({ label: materialPurchaseOrders.code })
        .from(materialPurchaseOrderItems)
        .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
        .where(eq(materialPurchaseOrderItems.materialCode, code)),
      db
        .selectDistinct({ label: inventoryTransactions.code })
        .from(inventoryTransactionItems)
        .innerJoin(inventoryTransactions, eq(inventoryTransactionItems.transactionId, inventoryTransactions.id))
        .where(eq(inventoryTransactionItems.materialCode, code)),
      db
        .selectDistinct({ label: legacyIssuePermits.issuePermitNumber })
        .from(legacyIssuePermitItems)
        .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
        .where(eq(legacyIssuePermitItems.materialCode, code)),
      db
        .selectDistinct({ label: maintenanceOrders.code })
        .from(maintenanceOrderMaterials)
        .innerJoin(maintenanceOrders, eq(maintenanceOrderMaterials.maintenanceOrderId, maintenanceOrders.id))
        .where(eq(maintenanceOrderMaterials.materialCode, code)),
      db
        .selectDistinct({ label: outsourcingOrders.code })
        .from(outsourcingOrderItems)
        .innerJoin(outsourcingOrders, eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrders.id))
        .where(eq(outsourcingOrderItems.manufacturedMaterialCode, code)),
      db
        .selectDistinct({ label: requestForQuotations.code })
        .from(requestForQuotationItems)
        .innerJoin(requestForQuotations, eq(requestForQuotationItems.requestForQuotationId, requestForQuotations.id))
        .where(eq(requestForQuotationItems.materialCode, code)),
      db
        .selectDistinct({
          label: sql<string>`${requestForQuotations.code} || ' / ' || ${suppliers.name}`.as('label'),
        })
        .from(supplierQuotationItems)
        .innerJoin(supplierQuotations, eq(supplierQuotationItems.supplierQuotationId, supplierQuotations.id))
        .innerJoin(requestForQuotations, eq(supplierQuotations.requestForQuotationId, requestForQuotations.id))
        .innerJoin(suppliers, eq(supplierQuotations.supplierId, suppliers.id))
        .where(eq(supplierQuotationItems.materialCode, code)),
    ]);

    const groups: MaterialDeleteReferenceGroup[] = [
      this.toReferenceGroup('unitConversions', unitConversions.map((row) => row.label)),
      this.toReferenceGroup('ownMmBomLines', ownMmBomLines.map((row) => row.label)),
      this.toReferenceGroup('componentOfMmBoms', componentOfMmBoms.map((row) => row.label)),
      this.toReferenceGroup('productBomLines', productBomLines.map((row) => row.label)),
      this.toReferenceGroup('purchaseRequisitions', purchaseRequisitions.map((row) => row.label)),
      this.toReferenceGroup('purchaseOrders', purchaseOrders.map((row) => row.label)),
      this.toReferenceGroup('inventoryTransactions', inventoryTxs.map((row) => row.label)),
      this.toReferenceGroup('legacyIssuePermits', legacyIssuePermitsGroup.map((row) => row.label)),
      this.toReferenceGroup('maintenanceOrders', maintenanceOrdersGroup.map((row) => row.label)),
      this.toReferenceGroup('outsourcingOrders', outsourcingOrdersGroup.map((row) => row.label)),
      this.toReferenceGroup('requestForQuotations', rfqs.map((row) => row.label)),
      this.toReferenceGroup('supplierQuotations', supplierQuotationsGroup.map((row) => row.label)),
    ].filter((group) => group.count > 0);

    const totalReferenceCount = groups.reduce((sum, group) => sum + group.count, 0);

    return {
      code: material.code,
      title: material.title,
      materialType: material.materialType,
      alreadyDeleted: material.deletedAt != null,
      canHardDelete: totalReferenceCount === 0,
      totalReferenceCount,
      groups,
    };
  }

  private toReferenceGroup(key: string, labels: string[]): MaterialDeleteReferenceGroup {
    return {
      key,
      count: labels.length,
      samples: labels.slice(0, DELETE_IMPACT_SAMPLE_LIMIT),
    };
  }

  private isForeignKeyViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate.code === '23503' || candidate.cause?.code === '23503';
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      // Full 6-digit range (100000–999999) so codes never have leading zeros
      const code = String(randomInt(100_000, 1_000_000));
      const existing = await this.db.query.materials.findFirst({ where: eq(materials.code, code), columns: { code: true } });
      if (!existing) return code;
    }
    throw new Error('Failed to generate a unique 6-digit material code after 1000 attempts.');
  }
}
