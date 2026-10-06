import { and, asc, desc, eq, inArray, isNull, ne, SQL } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialUnitConversions,
  materials,
  outsourcingOrderItems,
  outsourcingOrders,
  productDimensions,
  products,
  productStandardBoms,
} from 'src/database/schema';
import { MATERIAL_TYPES, MM_SOURCING_TYPES, PRODUCT_SOURCE_TYPES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import {
  type MaterialUnit,
  type MmSourcingType,
  type ProductionSubDepartment,
  type User,
  type UserWithRoleWithPermissions,
} from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { convertUnitPrice } from 'src/utils/helpers/unit-conversion';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomItemDto } from './dto/create-bom-item.dto';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { ReplaceDepartmentBomDto } from './dto/replace-department-bom.dto';
import { omitPricingFactorIfUnauthorized } from 'src/modules/products/product-pricing-factor.helper';

@Injectable()
export class BomsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async create(dimensionId: string, createBomDto: CreateBomDto, user: User) {
    const { items } = createBomDto;

    await this.assertIsManufacturedProduct(dimensionId);

    const productionSubDepartments = new Set(items.map((item) => item.productionSubDepartment));
    if (productionSubDepartments.size > 1) {
      throw new ConflictException(
        translate(
          'All BOM items in a single create request must belong to the same production department.',
          'يجب أن تنتمي جميع بنود قائمة المواد في طلب الإنشاء الواحد إلى نفس قسم الانتاج.',
        ),
      );
    }

    const productionSubDepartment = items[0].productionSubDepartment;

    if (
      await this.db.query.productStandardBoms.findFirst({
        where: this.dimensionDepartmentWhere(dimensionId, productionSubDepartment),
        columns: { id: true },
      })
    ) {
      throw new ConflictException(
        translate(
          `A BOM already exists for dimension ${dimensionId} in this production department.`,
          `توجد بالفعل قائمة مواد للمقاس ${dimensionId} في قسم الانتاج هذا.`,
        ),
      );
    }

    // Check for duplicate material codes in the BOM items
    const seen = new Set<string>();
    for (const code of items.map((item) => item.materialCode)) {
      if (seen.has(code))
        throw new ConflictException(
          translate(`Duplicate material code ${code} in BOM items.`, `كود المادة ${code} مكرر في بنود قائمة المواد.`),
        );
      seen.add(code);
    }

    await this.assertMmSourcingTypeForItems(items);

    const values = items.map((item) => ({
      ...item,
      mmSourcingType: item.mmSourcingType ?? null,
      createdBy: user.id,
      productDimensionId: dimensionId,
    }));

    return await this.db.transaction(async (tx) => {
      return await tx.insert(productStandardBoms).values(values).returning();
    });
  }

  public async get(dimensionId: string, user: User) {
    const dimension = await this.db.query.productDimensions.findFirst({
      where: eq(productDimensions.id, dimensionId),
      columns: {
        id: true,
        productCode: true,
        length: true,
        depth: true,
        diameter: true,
        height: true,
        isDefault: true,
        notes: true,
      },
      with: {
        product: {
          columns: {
            code: true,
            title: true,
            subCategoryId: true,
            sourceType: true,
            estimatedProductionTime: true,
            pricingFactor: true,
          },
        },
        standardBoms: {
          columns: {
            id: true,
            productDimensionId: true,
            materialCode: true,
            quantityRequired: true,
            unitOfMeasurementSelected: true,
            productionSubDepartment: true,
            mmSourcingType: true,
            legacyQuantity: true,
            notes: true,
          },
          with: {
            material: {
              columns: {
                code: true,
                title: true,
                materialType: true,
                subCategoryId: true,
                unitOfMeasurement: true,
                unitPrice: true,
                marketUnitPrice: true,
                marketUnitPriceSetAt: true,
              },
              extras: materialUnitConversionsExtra,
            },
          },
        },
      },
    });

    if (!dimension)
      throw new NotFoundException(
        translate(`Product dimension with ID ${dimensionId} does not exist.`, `لا يوجد مقاس منتج بالمعرف ${dimensionId}.`),
      );

    // Only expand MM recipes for lines that are internally or externally manufactured.
    const recipeMaterialCodes = [
      ...new Set(
        dimension.standardBoms
          .filter(
            (item) =>
              item.material.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL &&
              (item.mmSourcingType === MM_SOURCING_TYPES.INTERNALLY_MANUFACTURED ||
                item.mmSourcingType === MM_SOURCING_TYPES.EXTERNALLY_MANUFACTURED),
          )
          .map((item) => item.material.code),
      ),
    ];

    const manufacturedMaterialCodes = [
      ...new Set(
        dimension.standardBoms
          .filter((item) => item.material.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL)
          .map((item) => item.material.code),
      ),
    ];

    const componentsByMaterialCode = await this.getManufacturedMaterialComponents(recipeMaterialCodes);

    const allMaterialCodes = [
      ...new Set([
        ...dimension.standardBoms.map((item) => item.material.code),
        ...[...componentsByMaterialCode.values()].flatMap((components) =>
          components.map((component) => component.material.code),
        ),
      ]),
    ];

    const [lastPurchaseByMaterialCode, lastOutsourcingByMaterialCode] = await Promise.all([
      this.getLastPurchaseByMaterialCode(allMaterialCodes),
      this.getLastOutsourcingCostByMaterialCode(manufacturedMaterialCodes),
    ]);

    return {
      ...dimension,
      product: omitPricingFactorIfUnauthorized(dimension.product, user as UserWithRoleWithPermissions),
      standardBoms: dimension.standardBoms.map((item) => {
        const lastPurchase = lastPurchaseByMaterialCode.get(item.material.code);
        const lastOutsourcing = lastOutsourcingByMaterialCode.get(item.material.code);
        const includeRecipe =
          item.mmSourcingType === MM_SOURCING_TYPES.INTERNALLY_MANUFACTURED ||
          item.mmSourcingType === MM_SOURCING_TYPES.EXTERNALLY_MANUFACTURED;

        return {
          ...item,
          material: {
            ...item.material,
            lastPurchasePrice: lastPurchase?.price ?? null,
            lastPurchaseDate: lastPurchase?.date ?? null,
            lastOutsourcingCost: lastOutsourcing?.cost ?? null,
            lastOutsourcingDate: lastOutsourcing?.date ?? null,
            manufacturedMaterialBoms: includeRecipe
              ? (componentsByMaterialCode.get(item.material.code) || []).map((component) => {
                  const componentLastPurchase = lastPurchaseByMaterialCode.get(component.material.code);
                  return {
                    ...component,
                    material: {
                      ...component.material,
                      lastPurchasePrice: componentLastPurchase?.price ?? null,
                      lastPurchaseDate: componentLastPurchase?.date ?? null,
                    },
                  };
                })
              : [],
          },
        };
      }),
    };
  }

  public async listByMaterial(materialCode: string) {
    const rows = await this.db
      .select({
        id: productStandardBoms.id,
        quantityRequired: productStandardBoms.quantityRequired,
        unitOfMeasurementSelected: productStandardBoms.unitOfMeasurementSelected,
        productionSubDepartment: productStandardBoms.productionSubDepartment,
        legacyQuantity: productStandardBoms.legacyQuantity,
        notes: productStandardBoms.notes,
        dimensionId: productDimensions.id,
        length: productDimensions.length,
        depth: productDimensions.depth,
        diameter: productDimensions.diameter,
        height: productDimensions.height,
        productCode: products.code,
        productTitle: products.title,
      })
      .from(productStandardBoms)
      .innerJoin(productDimensions, eq(productStandardBoms.productDimensionId, productDimensions.id))
      .innerJoin(products, eq(productDimensions.productCode, products.code))
      .where(and(eq(productStandardBoms.materialCode, materialCode), isNull(products.deletedAt)))
      .orderBy(asc(products.code), asc(productDimensions.height), asc(productDimensions.id));

    return rows.map((row) => ({
      id: row.id,
      quantityRequired: row.quantityRequired,
      unitOfMeasurementSelected: row.unitOfMeasurementSelected,
      productionSubDepartment: row.productionSubDepartment,
      legacyQuantity: row.legacyQuantity,
      notes: row.notes,
      dimension: {
        id: row.dimensionId,
        length: row.length,
        depth: row.depth,
        diameter: row.diameter,
        height: row.height,
      },
      product: {
        code: row.productCode,
        title: row.productTitle,
      },
    }));
  }

  public async appendItem(dimensionId: string, createBomItemDto: CreateBomItemDto, user: User) {
    await this.assertIsManufacturedProduct(dimensionId);

    const productionSubDepartment = createBomItemDto.productionSubDepartment;

    if (
      !(await this.db.query.productStandardBoms.findFirst({
        where: this.dimensionDepartmentWhere(dimensionId, productionSubDepartment),
        columns: { id: true },
      }))
    ) {
      throw new NotFoundException(
        translate(
          `No BOM exists for dimension ${dimensionId} in this production department. Create the BOM first.`,
          `لا توجد قائمة مواد للمقاس ${dimensionId} في قسم الانتاج هذا. أنشئ قائمة المواد أولاً.`,
        ),
      );
    }

    // For the following check, we can depend on the database constraint, but we use it here for a more readable error message.
    if (
      await this.db.query.productStandardBoms.findFirst({
        where: and(
          this.dimensionDepartmentWhere(dimensionId, productionSubDepartment),
          eq(productStandardBoms.materialCode, createBomItemDto.materialCode),
        ),
        columns: { id: true },
      })
    )
      throw new ConflictException(
        translate(
          `Material ${createBomItemDto.materialCode} is already in the BOM for this dimension and production department.`,
          `المادة ${createBomItemDto.materialCode} موجودة بالفعل في قائمة المواد لهذا المقاس وقسم الانتاج.`,
        ),
      );

    await this.assertMmSourcingTypeForItems([createBomItemDto]);

    const [item] = await this.db
      .insert(productStandardBoms)
      .values({
        ...createBomItemDto,
        mmSourcingType: createBomItemDto.mmSourcingType ?? null,
        productDimensionId: dimensionId,
        createdBy: user.id,
      })
      .returning();

    return item;
  }

  public async replaceDepartment(
    dimensionId: string,
    productionSubDepartment: ProductionSubDepartment,
    replaceDto: ReplaceDepartmentBomDto,
    user: User,
  ) {
    if (!PRODUCTION_SUB_DEPARTMENT_VALUES.includes(productionSubDepartment)) {
      throw new BadRequestException(
        translate(
          `Invalid production department: ${productionSubDepartment}.`,
          `قسم الانتاج غير صالح: ${productionSubDepartment}.`,
        ),
      );
    }

    await this.assertIsManufacturedProduct(dimensionId);

    const { items } = replaceDto;

    const seen = new Set<string>();
    for (const code of items.map((item) => item.materialCode)) {
      if (seen.has(code))
        throw new ConflictException(
          translate(`Duplicate material code ${code} in BOM items.`, `كود المادة ${code} مكرر في بنود قائمة المواد.`),
        );
      seen.add(code);
    }

    await this.assertMmSourcingTypeForItems(items);

    return await this.db.transaction(async (tx) => {
      const existingRows = await tx.query.productStandardBoms.findMany({
        where: this.dimensionDepartmentWhere(dimensionId, productionSubDepartment),
      });

      if (existingRows.length === 0) {
        throw new NotFoundException(
          translate(
            `No BOM exists for dimension ${dimensionId} in this production department.`,
            `لا توجد قائمة مواد للمقاس ${dimensionId} في قسم الانتاج هذا.`,
          ),
        );
      }

      const existingByCode = new Map(existingRows.map((row) => [row.materialCode, row]));
      const incomingCodes = new Set(items.map((item) => item.materialCode));

      const toDeleteIds = existingRows.filter((row) => !incomingCodes.has(row.materialCode)).map((row) => row.id);

      const toInsert = items.filter((item) => !existingByCode.has(item.materialCode));

      const toUpdate = items.flatMap((item) => {
        const existing = existingByCode.get(item.materialCode);
        if (!existing) return [];

        const mmSourcingType = item.mmSourcingType ?? null;
        const notes = item.notes ?? null;
        const legacyQuantity = item.legacyQuantity ?? null;
        const changed =
          Number(existing.quantityRequired) !== item.quantityRequired ||
          existing.unitOfMeasurementSelected !== item.unitOfMeasurementSelected ||
          (existing.mmSourcingType ?? null) !== mmSourcingType ||
          (existing.notes ?? null) !== notes ||
          (existing.legacyQuantity ?? null) !== legacyQuantity;

        if (!changed) return [];

        return [
          {
            id: existing.id,
            quantityRequired: item.quantityRequired,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            mmSourcingType,
            notes,
            legacyQuantity,
          },
        ];
      });

      if (toDeleteIds.length > 0) {
        await tx.delete(productStandardBoms).where(inArray(productStandardBoms.id, toDeleteIds));
      }

      const updatedRows: (typeof existingRows)[number][] = [];
      for (const item of toUpdate) {
        const [updated] = await tx
          .update(productStandardBoms)
          .set({
            quantityRequired: item.quantityRequired,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            mmSourcingType: item.mmSourcingType,
            notes: item.notes,
            legacyQuantity: item.legacyQuantity,
          })
          .where(eq(productStandardBoms.id, item.id))
          .returning();
        if (updated) updatedRows.push(updated);
      }

      const insertedRows =
        toInsert.length > 0
          ? await tx
              .insert(productStandardBoms)
              .values(
                toInsert.map((item) => ({
                  ...item,
                  mmSourcingType: item.mmSourcingType ?? null,
                  productionSubDepartment,
                  createdBy: user.id,
                  productDimensionId: dimensionId,
                })),
              )
              .returning()
          : [];

      const updatedIds = new Set(updatedRows.map((row) => row.id));
      const unchangedRows = existingRows.filter(
        (row) => incomingCodes.has(row.materialCode) && !updatedIds.has(row.id),
      );

      return [...unchangedRows, ...updatedRows, ...insertedRows];
    });
  }

  public async updateItem(itemId: string, updateBomItemDto: UpdateBomItemDto) {
    const existing = await this.db.query.productStandardBoms.findFirst({
      where: eq(productStandardBoms.id, itemId),
      columns: { id: true, productDimensionId: true },
    });

    if (!existing) {
      throw new NotFoundException(
        translate(`BOM item with ID ${itemId} does not exist.`, `لا يوجد بند قائمة مواد بالمعرف ${itemId}.`),
      );
    }

    // For the following check, we can depend on the database constraint, but we use it here for a more readable error message.
    if (
      await this.db.query.productStandardBoms.findFirst({
        where: and(
          this.dimensionDepartmentWhere(existing.productDimensionId, updateBomItemDto.productionSubDepartment),
          eq(productStandardBoms.materialCode, updateBomItemDto.materialCode),
          ne(productStandardBoms.id, itemId),
        ),
        columns: { id: true },
      })
    ) {
      throw new ConflictException(
        translate(
          `Material ${updateBomItemDto.materialCode} is already in the BOM for this dimension and production department.`,
          `المادة ${updateBomItemDto.materialCode} موجودة بالفعل في قائمة المواد لهذا المقاس وقسم الانتاج.`,
        ),
      );
    }

    await this.assertMmSourcingTypeForItems([updateBomItemDto]);

    const [updatedItem] = await this.db
      .update(productStandardBoms)
      .set({
        ...updateBomItemDto,
        mmSourcingType: updateBomItemDto.mmSourcingType ?? null,
      })
      .where(eq(productStandardBoms.id, itemId))
      .returning();

    return updatedItem;
  }

  public async deleteItem(itemId: string) {
    const [deletedItem] = await this.db
      .delete(productStandardBoms)
      .where(eq(productStandardBoms.id, itemId))
      .returning();

    if (!deletedItem)
      throw new NotFoundException(
        translate(`BOM item with ID ${itemId} does not exist.`, `لا يوجد بند قائمة مواد بالمعرف ${itemId}.`),
      );

    return deletedItem;
  }

  public async deleteAll(dimensionId: string) {
    const dimension = await this.db.query.productDimensions.findFirst({
      where: eq(productDimensions.id, dimensionId),
      columns: { id: true },
    });

    if (!dimension) {
      throw new NotFoundException(
        translate(`Product dimension with ID ${dimensionId} does not exist.`, `لا يوجد مقاس منتج بالمعرف ${dimensionId}.`),
      );
    }

    const deletedItems = await this.db
      .delete(productStandardBoms)
      .where(eq(productStandardBoms.productDimensionId, dimensionId))
      .returning({ id: productStandardBoms.id });

    if (deletedItems.length === 0) {
      throw new NotFoundException(
        translate(
          `No BOM exists for dimension ${dimensionId}.`,
          `لا توجد قائمة مواد للمقاس ${dimensionId}.`,
        ),
      );
    }

    return { deletedCount: deletedItems.length };
  }

  // ============================== PRIVATE METHODS ==============================

  private dimensionDepartmentWhere(dimensionId: string, productionSubDepartment: ProductionSubDepartment): SQL {
    return and(
      eq(productStandardBoms.productDimensionId, dimensionId),
      eq(productStandardBoms.productionSubDepartment, productionSubDepartment),
    )!;
  }

  private async assertIsManufacturedProduct(productDimensionId: string) {
    const dimension = await this.db.query.productDimensions.findFirst({
      where: eq(productDimensions.id, productDimensionId),
      columns: { id: true },
      with: {
        product: {
          columns: { code: true, sourceType: true },
        },
      },
    });

    if (!dimension) {
      throw new NotFoundException(
        translate(
          `Product dimension with ID ${productDimensionId} does not exist.`,
          `لا يوجد مقاس منتج بالمعرف ${productDimensionId}.`,
        ),
      );
    }

    if (dimension.product.sourceType !== PRODUCT_SOURCE_TYPES.MANUFACTURED) {
      throw new ConflictException(
        translate(
          `Product ${dimension.product.code} is not a manufactured product.`,
          `المنتج ${dimension.product.code} ليس منتجاً مصنعاً.`,
        ),
      );
    }
  }

  // @APP_CHECKED - mm_sourcing_type must be non-null iff the material is a manufactured_material.
  private async assertMmSourcingTypeForItems(
    items: { materialCode: string; mmSourcingType?: MmSourcingType | null }[],
  ) {
    if (items.length === 0) return;

    const materialCodes = [...new Set(items.map((item) => item.materialCode))];
    const materialRows = await this.db
      .select({ code: materials.code, materialType: materials.materialType })
      .from(materials)
      .where(inArray(materials.code, materialCodes));

    const materialTypeByCode = new Map(materialRows.map((row) => [row.code, row.materialType]));

    for (const item of items) {
      const materialType = materialTypeByCode.get(item.materialCode);

      if (!materialType) {
        throw new NotFoundException(
          translate(
            `Material with code ${item.materialCode} does not exist.`,
            `لا توجد مادة بالكود ${item.materialCode}.`,
          ),
        );
      }

      const isManufactured = materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL;
      const sourcingType = item.mmSourcingType ?? null;

      if (isManufactured && sourcingType === null) {
        throw new ConflictException(
          translate(
            `Manufactured material ${item.materialCode} requires a manufacturing source.`,
            `المادة المصنعة ${item.materialCode} تتطلب مصدر التصنيع.`,
          ),
        );
      }

      if (!isManufactured && sourcingType !== null) {
        throw new ConflictException(
          translate(
            `Manufacturing source can only be set for manufactured materials (got ${item.materialCode}).`,
            `يمكن تعيين مصدر التصنيع للمواد المصنعة فقط (المادة ${item.materialCode}).`,
          ),
        );
      }
    }
  }

  // Nested relational query through productStandardBoms → material → manufacturedMaterialBoms breaks under Drizzle's dual materials ↔ mm-boms relations; load MM components separately.
  private async getManufacturedMaterialComponents(manufacturedMaterialCodes: string[]) {
    const manufacturedMaterials =
      manufacturedMaterialCodes.length > 0
        ? await this.db.query.materials.findMany({
            where: inArray(materials.code, manufacturedMaterialCodes),
            columns: { code: true },
            with: {
              manufacturedMaterialBoms: {
                columns: {
                  id: true,
                  materialCode: true,
                  quantityRequired: true,
                  unitOfMeasurementSelected: true,
                  notes: true,
                },
                with: {
                  material: {
                    columns: {
                      code: true,
                      title: true,
                      materialType: true,
                      subCategoryId: true,
                      unitOfMeasurement: true,
                      unitPrice: true,
                      marketUnitPrice: true,
                      marketUnitPriceSetAt: true,
                    },
                    extras: materialUnitConversionsExtra,
                  },
                },
              },
            },
          })
        : [];

    return new Map(manufacturedMaterials.map((material) => [material.code, material.manufacturedMaterialBoms]));
  }

  // Last purchased price = newest non-cancelled PO line unit price, normalized to the material's base unit.
  private async getLastPurchaseByMaterialCode(materialCodes: string[]) {
    if (materialCodes.length === 0) return new Map<string, { price: number; date: Date }>();

    const rows = await this.db
      .selectDistinctOn([materialPurchaseOrderItems.materialCode], {
        materialCode: materialPurchaseOrderItems.materialCode,
        unitPrice: materialPurchaseOrderItems.unitPrice,
        unitOfMeasurementSelected: materialPurchaseOrderItems.unitOfMeasurementSelected,
        createdAt: materialPurchaseOrders.createdAt,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .where(
        and(inArray(materialPurchaseOrderItems.materialCode, materialCodes), isNull(materialPurchaseOrders.cancelledAt)),
      )
      .orderBy(materialPurchaseOrderItems.materialCode, desc(materialPurchaseOrders.createdAt));

    if (rows.length === 0) return new Map<string, { price: number; date: Date }>();

    const purchasedCodes = [...new Set(rows.map((row) => row.materialCode))];

    const [materialRows, conversionRows] = await Promise.all([
      this.db
        .select({ code: materials.code, unitOfMeasurement: materials.unitOfMeasurement })
        .from(materials)
        .where(inArray(materials.code, purchasedCodes)),
      this.db
        .select({
          materialCode: materialUnitConversions.materialCode,
          unit: materialUnitConversions.unit,
          conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
        })
        .from(materialUnitConversions)
        .where(inArray(materialUnitConversions.materialCode, purchasedCodes)),
    ]);

    const baseUnitByCode = new Map(materialRows.map((row) => [row.code, row.unitOfMeasurement as MaterialUnit]));
    const conversionsByCode = new Map<string, { unit: MaterialUnit; conversionFactorToBase: number }[]>();
    for (const row of conversionRows) {
      const list = conversionsByCode.get(row.materialCode) ?? [];
      list.push({ unit: row.unit as MaterialUnit, conversionFactorToBase: Number(row.conversionFactorToBase) });
      conversionsByCode.set(row.materialCode, list);
    }

    return new Map(
      rows.map((row) => {
        const baseUnit = baseUnitByCode.get(row.materialCode);
        const purchaseUnit = row.unitOfMeasurementSelected as MaterialUnit;
        const unitPrice = Number(row.unitPrice);
        const date = row.createdAt;

        if (!baseUnit) return [row.materialCode, { price: unitPrice, date }] as const;

        const priceInBase = convertUnitPrice(
          unitPrice,
          purchaseUnit,
          baseUnit,
          baseUnit,
          conversionsByCode.get(row.materialCode) ?? [],
        );

        return [row.materialCode, { price: priceInBase, date }] as const;
      }),
    );
  }

  // Last outsourcing manufacturing cost = newest non-cancelled OSO line unit cost, normalized to the MM's base unit.
  private async getLastOutsourcingCostByMaterialCode(materialCodes: string[]) {
    if (materialCodes.length === 0) return new Map<string, { cost: number; date: Date }>();

    const rows = await this.db
      .selectDistinctOn([outsourcingOrderItems.manufacturedMaterialCode], {
        manufacturedMaterialCode: outsourcingOrderItems.manufacturedMaterialCode,
        unitManufacturingCost: outsourcingOrderItems.unitManufacturingCost,
        unitOfMeasurementSelected: outsourcingOrderItems.unitOfMeasurementSelected,
        createdAt: outsourcingOrders.createdAt,
      })
      .from(outsourcingOrderItems)
      .innerJoin(outsourcingOrders, eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrders.id))
      .where(
        and(
          inArray(outsourcingOrderItems.manufacturedMaterialCode, materialCodes),
          isNull(outsourcingOrders.cancelledAt),
        ),
      )
      .orderBy(outsourcingOrderItems.manufacturedMaterialCode, desc(outsourcingOrders.createdAt));

    if (rows.length === 0) return new Map<string, { cost: number; date: Date }>();

    const outsourcedCodes = [...new Set(rows.map((row) => row.manufacturedMaterialCode))];

    const [materialRows, conversionRows] = await Promise.all([
      this.db
        .select({ code: materials.code, unitOfMeasurement: materials.unitOfMeasurement })
        .from(materials)
        .where(inArray(materials.code, outsourcedCodes)),
      this.db
        .select({
          materialCode: materialUnitConversions.materialCode,
          unit: materialUnitConversions.unit,
          conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
        })
        .from(materialUnitConversions)
        .where(inArray(materialUnitConversions.materialCode, outsourcedCodes)),
    ]);

    const baseUnitByCode = new Map(materialRows.map((row) => [row.code, row.unitOfMeasurement as MaterialUnit]));
    const conversionsByCode = new Map<string, { unit: MaterialUnit; conversionFactorToBase: number }[]>();
    for (const row of conversionRows) {
      const list = conversionsByCode.get(row.materialCode) ?? [];
      list.push({ unit: row.unit as MaterialUnit, conversionFactorToBase: Number(row.conversionFactorToBase) });
      conversionsByCode.set(row.materialCode, list);
    }

    return new Map(
      rows.map((row) => {
        const baseUnit = baseUnitByCode.get(row.manufacturedMaterialCode);
        const orderUnit = row.unitOfMeasurementSelected as MaterialUnit;
        const unitCost = Number(row.unitManufacturingCost);
        const date = row.createdAt;

        if (!baseUnit) return [row.manufacturedMaterialCode, { cost: unitCost, date }] as const;

        const costInBase = convertUnitPrice(
          unitCost,
          orderUnit,
          baseUnit,
          baseUnit,
          conversionsByCode.get(row.manufacturedMaterialCode) ?? [],
        );

        return [row.manufacturedMaterialCode, { cost: costInBase, date }] as const;
      }),
    );
  }
}
