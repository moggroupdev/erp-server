import { randomInt } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materials } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

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
    });
  }

  // We allow the `get` method to return a deleted material too
  public async get(code: string) {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, code),
      with: { createdBy: { columns: { id: true, name: true } } },
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

  // ============================== PRIVATE METHODS ==============================

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
