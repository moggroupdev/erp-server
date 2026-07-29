import { and, eq } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { productDimensions, productStandardBoms } from 'src/database/schema';
import { PRODUCT_SOURCE_TYPES } from 'src/utils/constants';
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
        translate(
          `A BOM already exists for dimension ${dimensionId}.`,
          `توجد بالفعل قائمة مواد للمقاس ${dimensionId}.`,
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
        height: true,
        dimensionUnit: true,
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

    return dimension;
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
}
