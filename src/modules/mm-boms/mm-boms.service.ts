import { and, eq } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { manufacturedMaterialBoms, materials } from 'src/database/schema';
import { MATERIAL_TYPES } from 'src/utils/constants';
import { type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { CreateMmBomItemDto } from './dto/create-mm-bom-item.dto';
import { UpdateMmBomItemDto } from './dto/update-mm-bom-item.dto';

@Injectable()
export class MmBomsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async appendItem(manufacturedMaterialCode: string, createBomItemDto: CreateMmBomItemDto, user: User) {
    await this.assertIsManufacturedMaterial(manufacturedMaterialCode);

    // For the following check, we can depend on the database constraint, but we use it here for a more readable error message.
    const sameItemExistsInBom = await this.db.query.manufacturedMaterialBoms.findFirst({
      where: and(
        eq(manufacturedMaterialBoms.manufacturedMaterialCode, manufacturedMaterialCode),
        eq(manufacturedMaterialBoms.materialCode, createBomItemDto.materialCode),
      ),
      columns: { id: true },
    });

    if (sameItemExistsInBom) {
      throw new ConflictException(
        translate(
          `Material ${createBomItemDto.materialCode} is already in the BOM for this manufactured material.`,
          `المادة ${createBomItemDto.materialCode} موجودة بالفعل في قائمة المواد لهذه المادة المصنعة.`,
        ),
      );
    }

    await this.assertNoCircularReference(manufacturedMaterialCode, createBomItemDto.materialCode);

    const [item] = await this.db
      .insert(manufacturedMaterialBoms)
      .values({ ...createBomItemDto, manufacturedMaterialCode, createdBy: user.id })
      .returning();

    return item;
  }

  public async get(manufacturedMaterialCode: string) {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, manufacturedMaterialCode),
      columns: {
        code: true,
        title: true,
        description: true,
        subCategoryId: true,
        materialType: true,
        unitOfMeasurement: true,
        unitPrice: true,
        quantity: true,
      },
      with: {
        manufacturedMaterialBoms: {
          columns: {
            id: true,
            manufacturedMaterialCode: true,
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
                materialType: true,
                unitOfMeasurement: true,
                unitPrice: true,
              },
            },
          },
        },
      },
    });

    if (!material) {
      throw new NotFoundException(
        translate(
          `Material with code ${manufacturedMaterialCode} does not exist.`,
          `لا توجد مادة بالكود ${manufacturedMaterialCode}.`,
        ),
      );
    }

    return material;
  }

  public async updateItem(itemId: string, updateBomItemDto: UpdateMmBomItemDto) {
    const [updatedItem] = await this.db
      .update(manufacturedMaterialBoms)
      .set(updateBomItemDto)
      .where(eq(manufacturedMaterialBoms.id, itemId))
      .returning();

    if (!updatedItem) {
      throw new NotFoundException(
        translate(`BOM item with ID ${itemId} does not exist.`, `لا يوجد بند قائمة مواد بالمعرف ${itemId}.`),
      );
    }

    return updatedItem;
  }

  // ============================== PRIVATE METHODS ==============================

  private async assertIsManufacturedMaterial(materialCode: string) {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, materialCode),
      columns: { code: true, materialType: true },
    });

    if (!material) {
      throw new NotFoundException(
        translate(`Material with code ${materialCode} does not exist.`, `لا توجد مادة بالكود ${materialCode}.`),
      );
    }

    if (material.materialType !== MATERIAL_TYPES.MANUFACTURED_MATERIAL) {
      throw new ConflictException(
        translate(`Material ${materialCode} is not a manufactured material.`, `المادة ${materialCode} ليست مادة مصنعة.`),
      );
    }
  }

  // Walk the component's BOM tree; reject if manufacturedMaterialCode appears (indirect cycle).
  // Direct self-reference is already blocked by the DB check manufactured_material_boms_no_self_reference.
  private async assertNoCircularReference(manufacturedMaterialCode: string, componentMaterialCode: string) {
    const visited = new Set<string>();
    const queue = [componentMaterialCode];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current === manufacturedMaterialCode) {
        throw new ConflictException(
          translate(
            `Adding material ${componentMaterialCode} would create a circular BOM chain for ${manufacturedMaterialCode}.`,
            `إضافة المادة ${componentMaterialCode} ستنشئ سلسلة دائرية في قائمة المواد للمادة ${manufacturedMaterialCode}.`,
          ),
        );
      }

      const children = await this.db.query.manufacturedMaterialBoms.findMany({
        where: eq(manufacturedMaterialBoms.manufacturedMaterialCode, current),
        columns: { materialCode: true },
      });

      for (const child of children) {
        if (!visited.has(child.materialCode)) {
          queue.push(child.materialCode);
        }
      }
    }
  }
}
