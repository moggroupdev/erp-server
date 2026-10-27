import { and, eq, ne } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialCategoryMains, materialCategorySubs, productCategoryMains, productCategorySubs } from 'src/database/schema';
import { translate } from 'src/utils/i18n/translate';
import { CreateCategoryMainDto } from './dto/create-category-main.dto';
import { UpdateCategoryMainDto } from './dto/update-category-main.dto';
import { CreateCategorySubDto } from './dto/create-category-sub.dto';
import { UpdateCategorySubDto } from './dto/update-category-sub.dto';

export type CategoryDomain = 'material' | 'product';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getAllCategories() {
    const [materialCategoryMains, materialCategorySubs, productCategoryMains, productCategorySubs] = await Promise.all([
      this.getMaterialCategoryMains(),
      this.getMaterialCategorySubs(),
      this.getProductCategoryMains(),
      this.getProductCategorySubs(),
    ]);

    return { materialCategoryMains, materialCategorySubs, productCategoryMains, productCategorySubs };
  }

  public async getMaterialCategories() {
    const [materialCategoryMains, materialCategorySubs] = await Promise.all([
      this.getMaterialCategoryMains(),
      this.getMaterialCategorySubs(),
    ]);

    return { materialCategoryMains, materialCategorySubs };
  }

  public async getProductCategories() {
    const [productCategoryMains, productCategorySubs] = await Promise.all([
      this.getProductCategoryMains(),
      this.getProductCategorySubs(),
    ]);

    return { productCategoryMains, productCategorySubs };
  }

  public async getMaterialCategoryMains() {
    return this.db.query.materialCategoryMains.findMany();
  }

  public async getMaterialCategorySubs() {
    return this.db.query.materialCategorySubs.findMany();
  }

  public async getProductCategoryMains() {
    return this.db.query.productCategoryMains.findMany();
  }

  public async getProductCategorySubs() {
    return this.db.query.productCategorySubs.findMany();
  }

  public createMain(domain: CategoryDomain, dto: CreateCategoryMainDto) {
    return domain === 'material' ? this.createMaterialMain(dto) : this.createProductMain(dto);
  }

  public updateMain(domain: CategoryDomain, id: string, dto: UpdateCategoryMainDto) {
    return domain === 'material' ? this.updateMaterialMain(id, dto) : this.updateProductMain(id, dto);
  }

  public createSub(domain: CategoryDomain, dto: CreateCategorySubDto) {
    return domain === 'material' ? this.createMaterialSub(dto) : this.createProductSub(dto);
  }

  public updateSub(domain: CategoryDomain, id: string, dto: UpdateCategorySubDto) {
    return domain === 'material' ? this.updateMaterialSub(id, dto) : this.updateProductSub(id, dto);
  }

  // ========================= Material mains =========================

  private async createMaterialMain(dto: CreateCategoryMainDto) {
    await this.assertMaterialMainLegacyCodeFree(dto.legacyCode);
    const [row] = await this.db.insert(materialCategoryMains).values(dto).returning();
    return row;
  }

  private async updateMaterialMain(id: string, dto: UpdateCategoryMainDto) {
    const existing = await this.requireMaterialMain(id);
    if (dto.legacyCode !== undefined && dto.legacyCode !== existing.legacyCode) {
      await this.assertMaterialMainLegacyCodeFree(dto.legacyCode, id);
    }
    const [row] = await this.db.update(materialCategoryMains).set(dto).where(eq(materialCategoryMains.id, id)).returning();
    return row;
  }

  // ========================= Product mains =========================

  private async createProductMain(dto: CreateCategoryMainDto) {
    await this.assertProductMainLegacyCodeFree(dto.legacyCode);
    const [row] = await this.db.insert(productCategoryMains).values(dto).returning();
    return row;
  }

  private async updateProductMain(id: string, dto: UpdateCategoryMainDto) {
    const existing = await this.requireProductMain(id);
    if (dto.legacyCode !== undefined && dto.legacyCode !== existing.legacyCode) {
      await this.assertProductMainLegacyCodeFree(dto.legacyCode, id);
    }
    const [row] = await this.db.update(productCategoryMains).set(dto).where(eq(productCategoryMains.id, id)).returning();
    return row;
  }

  // ========================= Material subs =========================

  private async createMaterialSub(dto: CreateCategorySubDto) {
    await this.requireMaterialMain(dto.mainCategoryId, 'body');
    await this.assertMaterialSubLegacyCodeFree(dto.mainCategoryId, dto.legacyCode);
    const [row] = await this.db.insert(materialCategorySubs).values(dto).returning();
    return row;
  }

  private async updateMaterialSub(id: string, dto: UpdateCategorySubDto) {
    const existing = await this.requireMaterialSub(id);
    const mainCategoryId = dto.mainCategoryId ?? existing.mainCategoryId;
    const legacyCode = dto.legacyCode ?? existing.legacyCode;
    if (dto.mainCategoryId !== undefined && dto.mainCategoryId !== existing.mainCategoryId) {
      await this.requireMaterialMain(dto.mainCategoryId, 'body');
    }
    if (mainCategoryId !== existing.mainCategoryId || legacyCode !== existing.legacyCode) {
      await this.assertMaterialSubLegacyCodeFree(mainCategoryId, legacyCode, id);
    }
    const [row] = await this.db.update(materialCategorySubs).set(dto).where(eq(materialCategorySubs.id, id)).returning();
    return row;
  }

  // ========================= Product subs =========================

  private async createProductSub(dto: CreateCategorySubDto) {
    await this.requireProductMain(dto.mainCategoryId, 'body');
    await this.assertProductSubLegacyCodeFree(dto.mainCategoryId, dto.legacyCode);
    const [row] = await this.db.insert(productCategorySubs).values(dto).returning();
    return row;
  }

  private async updateProductSub(id: string, dto: UpdateCategorySubDto) {
    const existing = await this.requireProductSub(id);
    const mainCategoryId = dto.mainCategoryId ?? existing.mainCategoryId;
    const legacyCode = dto.legacyCode ?? existing.legacyCode;
    if (dto.mainCategoryId !== undefined && dto.mainCategoryId !== existing.mainCategoryId) {
      await this.requireProductMain(dto.mainCategoryId, 'body');
    }
    if (mainCategoryId !== existing.mainCategoryId || legacyCode !== existing.legacyCode) {
      await this.assertProductSubLegacyCodeFree(mainCategoryId, legacyCode, id);
    }
    const [row] = await this.db.update(productCategorySubs).set(dto).where(eq(productCategorySubs.id, id)).returning();
    return row;
  }

  // ========================= Lookups & uniqueness =========================

  private async requireMaterialMain(id: string, source: 'path' | 'body' = 'path') {
    const row = await this.db.query.materialCategoryMains.findFirst({ where: eq(materialCategoryMains.id, id) });
    if (!row) this.throwMainMissing(id, source);
    return row;
  }

  private async requireProductMain(id: string, source: 'path' | 'body' = 'path') {
    const row = await this.db.query.productCategoryMains.findFirst({ where: eq(productCategoryMains.id, id) });
    if (!row) this.throwMainMissing(id, source);
    return row;
  }

  private async requireMaterialSub(id: string) {
    const row = await this.db.query.materialCategorySubs.findFirst({ where: eq(materialCategorySubs.id, id) });
    if (!row) this.throwSubMissing(id);
    return row;
  }

  private async requireProductSub(id: string) {
    const row = await this.db.query.productCategorySubs.findFirst({ where: eq(productCategorySubs.id, id) });
    if (!row) this.throwSubMissing(id);
    return row;
  }

  private async assertMaterialMainLegacyCodeFree(legacyCode: string, excludeId?: string) {
    const row = await this.db.query.materialCategoryMains.findFirst({
      where: excludeId
        ? and(eq(materialCategoryMains.legacyCode, legacyCode), ne(materialCategoryMains.id, excludeId))
        : eq(materialCategoryMains.legacyCode, legacyCode),
      columns: { id: true },
    });
    if (row) this.throwMainLegacyCodeTaken(legacyCode);
  }

  private async assertProductMainLegacyCodeFree(legacyCode: string, excludeId?: string) {
    const row = await this.db.query.productCategoryMains.findFirst({
      where: excludeId
        ? and(eq(productCategoryMains.legacyCode, legacyCode), ne(productCategoryMains.id, excludeId))
        : eq(productCategoryMains.legacyCode, legacyCode),
      columns: { id: true },
    });
    if (row) this.throwMainLegacyCodeTaken(legacyCode);
  }

  private async assertMaterialSubLegacyCodeFree(mainCategoryId: string, legacyCode: string, excludeId?: string) {
    const row = await this.db.query.materialCategorySubs.findFirst({
      where: excludeId
        ? and(
            eq(materialCategorySubs.mainCategoryId, mainCategoryId),
            eq(materialCategorySubs.legacyCode, legacyCode),
            ne(materialCategorySubs.id, excludeId),
          )
        : and(eq(materialCategorySubs.mainCategoryId, mainCategoryId), eq(materialCategorySubs.legacyCode, legacyCode)),
      columns: { id: true },
    });
    if (row) this.throwSubLegacyCodeTaken(legacyCode);
  }

  private async assertProductSubLegacyCodeFree(mainCategoryId: string, legacyCode: string, excludeId?: string) {
    const row = await this.db.query.productCategorySubs.findFirst({
      where: excludeId
        ? and(
            eq(productCategorySubs.mainCategoryId, mainCategoryId),
            eq(productCategorySubs.legacyCode, legacyCode),
            ne(productCategorySubs.id, excludeId),
          )
        : and(eq(productCategorySubs.mainCategoryId, mainCategoryId), eq(productCategorySubs.legacyCode, legacyCode)),
      columns: { id: true },
    });
    if (row) this.throwSubLegacyCodeTaken(legacyCode);
  }

  // ========================= Errors =========================

  private throwMainMissing(id: string, source: 'path' | 'body'): never {
    const message = translate(`Main category with ID ${id} does not exist.`, `لا توجد فئة رئيسية بالمعرف ${id}.`);
    if (source === 'body') throw new BadRequestException(message);
    throw new NotFoundException(message);
  }

  private throwSubMissing(id: string): never {
    throw new NotFoundException(
      translate(`Subcategory with ID ${id} does not exist.`, `لا توجد فئة فرعية بالمعرف ${id}.`),
    );
  }

  private throwMainLegacyCodeTaken(legacyCode: string): never {
    throw new ConflictException(
      translate(
        `A main category with code ${legacyCode} already exists.`,
        `فئة رئيسية بالكود ${legacyCode} موجودة بالفعل.`,
      ),
    );
  }

  private throwSubLegacyCodeTaken(legacyCode: string): never {
    throw new ConflictException(
      translate(
        `A subcategory with code ${legacyCode} already exists under this main category.`,
        `فئة فرعية بالكود ${legacyCode} موجودة بالفعل تحت هذه الفئة الرئيسية.`,
      ),
    );
  }
}
