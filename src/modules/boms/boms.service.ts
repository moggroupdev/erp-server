import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materials,
  productDimensions,
  productStandardBoms,
} from 'src/database/schema';
import { MATERIAL_TYPES, PRODUCT_SOURCE_TYPES } from 'src/utils/constants';
import { type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomItemDto } from './dto/create-bom-item.dto';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';

@Injectable()
export class BomsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async create(dimensionId: string, createBomDto: CreateBomDto, user: User) {
    const { items } = createBomDto;

    await this.assertIsManufacturedProduct(dimensionId);

    if (
      await this.db.query.productStandardBoms.findFirst({
        where: eq(productStandardBoms.productDimensionId, dimensionId),
        columns: { id: true },
      })
    ) {
      throw new ConflictException(
        translate(`A BOM already exists for dimension ${dimensionId}.`, `توجد بالفعل قائمة مواد للمقاس ${dimensionId}.`),
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

    return await this.db.transaction(async (tx) => {
      return await tx
        .insert(productStandardBoms)
        .values(items.map((item) => ({ ...item, productDimensionId: dimensionId, createdBy: user.id })))
        .returning();
    });
  }

  public async appendItem(dimensionId: string, createBomItemDto: CreateBomItemDto, user: User) {
    await this.assertIsManufacturedProduct(dimensionId);

    if (
      !(await this.db.query.productStandardBoms.findFirst({
        where: eq(productStandardBoms.productDimensionId, dimensionId),
        columns: { id: true },
      }))
    ) {
      throw new NotFoundException(
        translate(
          `No BOM exists for dimension ${dimensionId}. Create the BOM first.`,
          `لا توجد قائمة مواد للمقاس ${dimensionId}. أنشئ قائمة المواد أولاً.`,
        ),
      );
    }

    // For the following check, we can depend on the database constraint, but we use it here for a more readable error message.
    if (
      await this.db.query.productStandardBoms.findFirst({
        where: and(
          eq(productStandardBoms.productDimensionId, dimensionId),
          eq(productStandardBoms.materialCode, createBomItemDto.materialCode),
        ),
        columns: { id: true },
      })
    )
      throw new ConflictException(
        translate(
          `Material ${createBomItemDto.materialCode} is already in the BOM for this dimension.`,
          `المادة ${createBomItemDto.materialCode} موجودة بالفعل في قائمة المواد لهذا المقاس.`,
        ),
      );

    const [item] = await this.db
      .insert(productStandardBoms)
      .values({ ...createBomItemDto, productDimensionId: dimensionId, createdBy: user.id })
      .returning();

    return item;
  }

  public async get(dimensionId: string) {
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
              },
            },
          },
        },
      },
    });

    if (!dimension)
      throw new NotFoundException(
        translate(`Product dimension with ID ${dimensionId} does not exist.`, `لا يوجد مقاس منتج بالمعرف ${dimensionId}.`),
      );

    const manufacturedMaterialCodes = [
      ...new Set(
        dimension.standardBoms
          .filter((item) => item.material.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL)
          .map((item) => item.material.code),
      ),
    ];

    const componentsByMaterialCode = await this.getManufacturedMaterialComponents(manufacturedMaterialCodes);

    const allMaterialCodes = [
      ...new Set([
        ...dimension.standardBoms.map((item) => item.material.code),
        ...[...componentsByMaterialCode.values()].flatMap((components) =>
          components.map((component) => component.material.code),
        ),
      ]),
    ];

    const lastPurchasePriceByMaterialCode = await this.getLastPurchasePriceByMaterialCode(allMaterialCodes);

    // Overwrite the results to enclude the manufactured naterial BOMs
    return {
      ...dimension,
      standardBoms: dimension.standardBoms.map((item) => ({
        ...item,
        material: {
          ...item.material,
          lastPurchasePrice: lastPurchasePriceByMaterialCode.get(item.material.code) ?? null,
          manufacturedMaterialBoms: (componentsByMaterialCode.get(item.material.code) || []).map((component) => ({
            ...component,
            material: {
              ...component.material,
              lastPurchasePrice: lastPurchasePriceByMaterialCode.get(component.material.code) ?? null,
            },
          })),
        },
      })),
    };
  }

  public async updateItem(itemId: string, updateBomItemDto: UpdateBomItemDto) {
    const [updatedItem] = await this.db
      .update(productStandardBoms)
      .set(updateBomItemDto)
      .where(eq(productStandardBoms.id, itemId))
      .returning();

    if (!updatedItem)
      throw new NotFoundException(
        translate(`BOM item with ID ${itemId} does not exist.`, `لا يوجد بند قائمة مواد بالمعرف ${itemId}.`),
      );

    return updatedItem;
  }

  // ============================== PRIVATE METHODS ==============================

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
                    },
                  },
                },
              },
            },
          })
        : [];

    return new Map(manufacturedMaterials.map((material) => [material.code, material.manufacturedMaterialBoms]));
  }

  // Last purchased price = unit price of the newest non-cancelled purchase order containing the material.
  private async getLastPurchasePriceByMaterialCode(materialCodes: string[]) {
    const rows =
      materialCodes.length > 0
        ? await this.db
            .selectDistinctOn([materialPurchaseOrderItems.materialCode], {
              materialCode: materialPurchaseOrderItems.materialCode,
              unitPrice: materialPurchaseOrderItems.unitPrice,
            })
            .from(materialPurchaseOrderItems)
            .innerJoin(
              materialPurchaseOrders,
              eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id),
            )
            .where(
              and(
                inArray(materialPurchaseOrderItems.materialCode, materialCodes),
                isNull(materialPurchaseOrders.cancelledAt),
              ),
            )
            .orderBy(materialPurchaseOrderItems.materialCode, desc(materialPurchaseOrders.createdAt))
        : [];

    return new Map(rows.map((row) => [row.materialCode, row.unitPrice]));
  }
}
