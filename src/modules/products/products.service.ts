import { randomInt } from 'crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { productCategorySubs, productDimensions, productProductionRoutes, products } from 'src/database/schema';
import { QueryParams, User, UserWithRoleWithPermissions } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductDimensionDto } from './dto/create-product-dimension.dto';
import { UpdateProductDimensionDto } from './dto/update-product-dimension.dto';
import { SetProductProductionRoutesDto } from './dto/set-product-production-routes.dto';
import { SetProductPricingFactorDto } from './dto/set-product-pricing-factor.dto';
import { omitPricingFactorIfUnauthorized } from './product-pricing-factor.helper';

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
    return omitPricingFactorIfUnauthorized(product, user as UserWithRoleWithPermissions);
  }

  public async list(queryParams: QueryParams, user: User) {
    const result = await this.queryBuilderService.execute(products, queryParams, {
      filtering: true,
      searchableFields: ['code', 'title', 'description'],
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

    return {
      ...result,
      data: result.data.map((product) =>
        omitPricingFactorIfUnauthorized(product as { pricingFactor?: unknown }, user as UserWithRoleWithPermissions),
      ),
    };
  }

  // We allow the `get` method to return a deleted product too
  public async get(code: string, user: User) {
    const product = await this.db.query.products.findFirst({
      where: eq(products.code, code),
      with: { createdBy: { columns: { id: true, name: true } } },
    });
    if (!product)
      throw new NotFoundException(translate(`Product with code ${code} does not exist.`, `لا يوجد منتج بالكود ${code}.`));
    return omitPricingFactorIfUnauthorized(product, user as UserWithRoleWithPermissions);
  }

  public async update(code: string, updateProductDto: UpdateProductDto, user: User) {
    const [updatedProduct] = await this.db
      .update(products)
      .set(updateProductDto)
      .where(and(eq(products.code, code), isNull(products.deletedAt)))
      .returning();
    if (!updatedProduct)
      throw new NotFoundException(translate(`Product with code ${code} does not exist.`, `لا يوجد منتج بالكود ${code}.`));
    return omitPricingFactorIfUnauthorized(updatedProduct, user as UserWithRoleWithPermissions);
  }

  public async setPricingFactor(code: string, dto: SetProductPricingFactorDto) {
    const [updatedProduct] = await this.db
      .update(products)
      .set({ pricingFactor: dto.pricingFactor })
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

  public async updateDimension(
    productCode: string,
    dimensionId: string,
    updateProductDimensionDto: UpdateProductDimensionDto,
  ) {
    const [updatedDimension] = await this.db
      .update(productDimensions)
      .set(updateProductDimensionDto)
      .where(and(eq(productDimensions.id, dimensionId), eq(productDimensions.productCode, productCode)))
      .returning();

    if (!updatedDimension) {
      throw new NotFoundException(
        translate(
          `Dimension with ID ${dimensionId} does not exist for product ${productCode}.`,
          `لا يوجد مقاس بالمعرف ${dimensionId} للمنتج ${productCode}.`,
        ),
      );
    }

    return updatedDimension;
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

  // ========================= Production Routes =========================

  public async setProductionRoutes(productCode: string, setProductProductionRoutesDto: SetProductProductionRoutesDto) {
    const { routes } = setProductProductionRoutesDto;

    const totalPercentage = routes.reduce((sum, route) => sum + route.completionPercentage, 0);
    if (totalPercentage !== 100) {
      throw new ConflictException(
        translate(
          `Completion percentages for product ${productCode} must sum to 100% (got ${totalPercentage}%).`,
          `يجب أن مجموع نسب الإنجاز للمنتج ${productCode} يساوي 100% (المجموع: ${totalPercentage}%).`,
        ),
      );
    }

    const seenSubDepartments = new Set<string>();
    const seenSequenceOrders = new Set<number>();
    for (const route of routes) {
      if (seenSubDepartments.has(route.productionSubDepartment)) {
        throw new ConflictException(
          translate(
            `Duplicate production department \`${route.productionSubDepartment}\` in routes.`,
            `قسم الانتاج \`${route.productionSubDepartment}\` مكرر في المسارات.`,
          ),
        );
      }
      if (seenSequenceOrders.has(route.sequenceOrder)) {
        throw new ConflictException(
          translate(
            `Duplicate sequence order \`${route.sequenceOrder}\` in routes.`,
            `ترتيب التسلسل \`${route.sequenceOrder}\` مكرر في المسارات.`,
          ),
        );
      }
      seenSubDepartments.add(route.productionSubDepartment);
      seenSequenceOrders.add(route.sequenceOrder);
    }

    return await this.db.transaction(async (tx) => {
      const existingRows = await tx.query.productProductionRoutes.findMany({
        where: eq(productProductionRoutes.productCode, productCode),
      });

      const existingByDepartment = new Map(existingRows.map((row) => [row.productionSubDepartment, row]));
      const incomingDepartments = new Set(routes.map((route) => route.productionSubDepartment));

      const toDeleteIds = existingRows
        .filter((row) => !incomingDepartments.has(row.productionSubDepartment))
        .map((row) => row.id);

      const toInsert = routes.filter((route) => !existingByDepartment.has(route.productionSubDepartment));

      const toUpdate = routes.flatMap((route) => {
        const existing = existingByDepartment.get(route.productionSubDepartment);
        if (!existing) return [];

        const sequenceChanged = existing.sequenceOrder !== route.sequenceOrder;
        const percentageChanged = existing.completionPercentage !== route.completionPercentage;
        if (!sequenceChanged && !percentageChanged) return [];

        return [
          {
            id: existing.id,
            sequenceOrder: route.sequenceOrder,
            completionPercentage: route.completionPercentage,
            sequenceChanged,
          },
        ];
      });

      if (toDeleteIds.length > 0)
        await tx.delete(productProductionRoutes).where(inArray(productProductionRoutes.id, toDeleteIds));

      // Move changed sequences aside first so a swap stays unique on (product_code, sequence_order).
      const sequenceChanges = toUpdate.filter((row) => row.sequenceChanged);
      const tempSequenceBase =
        Math.max(0, ...existingRows.map((row) => row.sequenceOrder), ...routes.map((route) => route.sequenceOrder)) + 1;

      for (const [index, row] of sequenceChanges.entries()) {
        await tx
          .update(productProductionRoutes)
          .set({ sequenceOrder: tempSequenceBase + index })
          .where(eq(productProductionRoutes.id, row.id));
      }

      const updatedRows: (typeof existingRows)[number][] = [];
      for (const row of toUpdate) {
        const [updated] = await tx
          .update(productProductionRoutes)
          .set({ sequenceOrder: row.sequenceOrder, completionPercentage: row.completionPercentage })
          .where(eq(productProductionRoutes.id, row.id))
          .returning();
        if (updated) updatedRows.push(updated);
      }

      const insertedRows =
        toInsert.length > 0
          ? await tx
              .insert(productProductionRoutes)
              .values(toInsert.map((route) => ({ ...route, productCode })))
              .returning()
          : [];

      const updatedIds = new Set(updatedRows.map((row) => row.id));
      const unchangedRows = existingRows.filter(
        (row) => incomingDepartments.has(row.productionSubDepartment) && !updatedIds.has(row.id),
      );

      return [...unchangedRows, ...updatedRows, ...insertedRows].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    });
  }

  public async listProductionRoutes(productCode: string) {
    return await this.db.query.productProductionRoutes.findMany({
      where: eq(productProductionRoutes.productCode, productCode),
      orderBy: asc(productProductionRoutes.sequenceOrder),
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
