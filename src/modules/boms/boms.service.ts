import { and, eq } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { productDimensions, productStandardBoms } from 'src/database/schema';
import { type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomItemDto } from './dto/create-bom-item.dto';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';

@Injectable()
export class BomsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async create(createBomDto: CreateBomDto, user: User) {
    const { productDimensionId, items } = createBomDto;

    const dimension = await this.db.query.productDimensions.findFirst({
      where: eq(productDimensions.id, productDimensionId),
      columns: { id: true },
    });

    if (!dimension) {
      throw new NotFoundException(
        translate(
          `Product dimension with ID ${productDimensionId} does not exist.`,
          `لا يوجد مقاس منتج بالمعرف ${productDimensionId}.`,
        ),
      );
    }

    const existingBomItem = await this.db.query.productStandardBoms.findFirst({
      where: eq(productStandardBoms.productDimensionId, productDimensionId),
      columns: { id: true },
    });

    if (existingBomItem) {
      throw new ConflictException(
        translate(
          `A BOM already exists for dimension ${productDimensionId}.`,
          `توجد بالفعل قائمة مواد للمقاس ${productDimensionId}.`,
        ),
      );
    }

    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));

    return await this.db.transaction(async (tx) => {
      return await tx
        .insert(productStandardBoms)
        .values(items.map((item) => ({ ...item, productDimensionId, createdBy: user.id })))
        .returning();
    });
  }

  public async appendItem(dimensionId: string, createBomItemDto: CreateBomItemDto, user: User) {
    const dimension = await this.db.query.productDimensions.findFirst({
      where: eq(productDimensions.id, dimensionId),
      columns: { id: true },
    });

    if (!dimension) {
      throw new NotFoundException(
        translate(`Product dimension with ID ${dimensionId} does not exist.`, `لا يوجد مقاس منتج بالمعرف ${dimensionId}.`),
      );
    }

    const existingBomItem = await this.db.query.productStandardBoms.findFirst({
      where: eq(productStandardBoms.productDimensionId, dimensionId),
      columns: { id: true },
    });

    if (!existingBomItem) {
      throw new NotFoundException(
        translate(
          `No BOM exists for dimension ${dimensionId}. Create the BOM first.`,
          `لا توجد قائمة مواد للمقاس ${dimensionId}. أنشئ قائمة المواد أولاً.`,
        ),
      );
    }

    await this.assertMaterialNotInBom(dimensionId, createBomItemDto.materialCode); // We can depend on the database constraint here, but we use it here for a more readable error message.

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

  private assertNoDuplicateMaterials(materialCodes: string[]) {
    const seen = new Set<string>();
    for (const code of materialCodes) {
      if (seen.has(code))
        throw new ConflictException(
          translate(`Duplicate material code ${code} in BOM items.`, `كود المادة ${code} مكرر في بنود قائمة المواد.`),
        );

      seen.add(code);
    }
  }

  private async assertMaterialNotInBom(dimensionId: string, materialCode: string) {
    const existing = await this.db.query.productStandardBoms.findFirst({
      where: and(
        eq(productStandardBoms.productDimensionId, dimensionId),
        eq(productStandardBoms.materialCode, materialCode),
      ),
      columns: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        translate(
          `Material ${materialCode} is already in the BOM for this dimension.`,
          `المادة ${materialCode} موجودة بالفعل في قائمة المواد لهذا المقاس.`,
        ),
      );
    }
  }
}
