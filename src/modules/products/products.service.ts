import { randomInt } from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { productCategorySubs, productDimensions, products } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductDimensionDto } from './dto/create-product-dimension.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createProductDto: CreateProductDto, user: User) {
    const code = await this.generateUniqueCode();
    const [product] = await this.db
      .insert(products)
      .values({ ...createProductDto, code, createdBy: user.id })
      .returning();
    return product;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(products, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyCode', 'title', 'description'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: { dimensions: true },
      additionalConditions: [isNull(products.deletedAt)],
      joinFilters: {
        mainCategoryId: {
          localColumn: products.subCategoryId,
          relatedIdColumn: productCategorySubs.id,
          relatedTable: productCategorySubs,
          relatedFilterColumn: productCategorySubs.mainCategoryId,
        },
      },
    });
  }

  // We allow the `get` method to return a deleted product too
  public async get(code: string) {
    const product = await this.db.query.products.findFirst({
      where: eq(products.code, code),
      with: { createdBy: { columns: { id: true, name: true } } },
    });
    if (!product)
      throw new NotFoundException(translate(`Product with code ${code} does not exist.`, `لا يوجد منتج بالكود ${code}.`));
    return product;
  }

  public async update(code: string, updateProductDto: UpdateProductDto) {
    const [updatedProduct] = await this.db
      .update(products)
      .set(updateProductDto)
      .where(and(eq(products.code, code), isNull(products.deletedAt)))
      .returning();
    if (!updatedProduct)
      throw new NotFoundException(translate(`Product with code ${code} does not exist.`, `لا يوجد منتج بالكود ${code}.`));
    return updatedProduct;
  }

  // ========================= Dimensions =========================

  public async addDimension(productCode: string, createProductDimensionDto: CreateProductDimensionDto, user: User) {
    const { isDefault, ...dimensionData } = createProductDimensionDto;

    return await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(productDimensions)
          .set({ isDefault: false })
          .where(and(eq(productDimensions.productCode, productCode), eq(productDimensions.isDefault, true)));
      }

      const [dimension] = await tx
        .insert(productDimensions)
        .values({ ...dimensionData, productCode, isDefault: isDefault || false, createdBy: user.id })
        .returning();

      return dimension;
    });
  }

  public async listDimensions(productCode: string) {
    return await this.db.query.productDimensions.findMany({
      where: eq(productDimensions.productCode, productCode),
      orderBy: desc(productDimensions.isDefault),
    });
  }

  public async setDefaultDimension(productCode: string, dimensionId: string) {
    const dimension = await this.db.query.productDimensions.findFirst({
      where: and(eq(productDimensions.id, dimensionId), eq(productDimensions.productCode, productCode)),
    });

    if (!dimension)
      throw new NotFoundException(
        translate(
          `Dimension with ID ${dimensionId} does not exist for product ${productCode}.`,
          `لا يوجد مقاس بالمعرف ${dimensionId} للمنتج ${productCode}.`,
        ),
      );

    if (dimension.isDefault) return dimension;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(productDimensions)
        .set({ isDefault: false })
        .where(and(eq(productDimensions.productCode, productCode), eq(productDimensions.isDefault, true)));

      const [updatedDimension] = await tx
        .update(productDimensions)
        .set({ isDefault: true })
        .where(eq(productDimensions.id, dimensionId))
        .returning();

      return updatedDimension;
    });
  }

  // ============================== PRIVATE METHODS ==============================

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = String(randomInt(100_000, 1_000_000));
      const existing = await this.db.query.products.findFirst({ where: eq(products.code, code), columns: { code: true } });
      if (!existing) return code;
    }
    throw new Error('Failed to generate a unique 6-digit product code after 1000 attempts.');
  }
}
