import { randomInt } from 'crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialCategorySubs, materials, materialUnitConversions } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { CreateMaterialUnitConversionDto } from './dto/create-material-unit-conversion.dto';

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
      withRelations: { unitConversions: { columns: { id: true, unit: true, conversionFactorToBase: true } } },
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
        unitConversions: { columns: { id: true, unit: true, conversionFactorToBase: true } },
      },
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

  // ============================== UNIT CONVERSIONS ==============================

  public async addUnitConversion(materialCode: string, dto: CreateMaterialUnitConversionDto, user: User) {
    const material = await this.assertMaterialExists(materialCode);

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

  public async listUnitConversions(materialCode: string) {
    await this.assertMaterialExists(materialCode);

    return await this.db.query.materialUnitConversions.findMany({
      where: eq(materialUnitConversions.materialCode, materialCode),
      with: { createdBy: { columns: { id: true, name: true } } },
      orderBy: asc(materialUnitConversions.createdAt),
    });
  }

  public async removeUnitConversion(materialCode: string, id: string) {
    await this.assertMaterialExists(materialCode);

    const [deleted] = await this.db
      .delete(materialUnitConversions)
      .where(and(eq(materialUnitConversions.id, id), eq(materialUnitConversions.materialCode, materialCode)))
      .returning();

    if (!deleted) {
      throw new NotFoundException(
        translate(
          `Unit conversion with ID ${id} does not exist for material ${materialCode}.`,
          `لا يوجد تحويل وحدة بالمعرف ${id} للمادة ${materialCode}.`,
        ),
      );
    }

    return deleted;
  }

  // ============================== PRIVATE METHODS ==============================

  private async assertMaterialExists(code: string) {
    const material = await this.db.query.materials.findFirst({
      where: and(eq(materials.code, code), isNull(materials.deletedAt)),
      columns: { code: true, unitOfMeasurement: true },
    });

    if (!material)
      throw new NotFoundException(translate(`Material with code ${code} does not exist.`, `لا توجد مادة بالكود ${code}.`));

    return material;
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
