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
    const parentMaterial = await this.db.query.materials.findFirst({
      where: eq(materials.code, manufacturedMaterialCode),
      columns: { code: true, materialType: true },
    });

    if (!parentMaterial) {
      throw new NotFoundException(
        translate(
          `Material with code ${manufacturedMaterialCode} does not exist.`,
          `لا توجد مادة بالكود ${manufacturedMaterialCode}.`,
        ),
      );
    }

    if (parentMaterial.materialType !== MATERIAL_TYPES.MANUFACTURED_MATERIAL) {
      throw new ConflictException(
        translate(
          `Material ${manufacturedMaterialCode} is not a manufactured material.`,
          `المادة ${manufacturedMaterialCode} ليست مادة مصنعة.`,
        ),
      );
    }

    const componentMaterial = await this.db.query.materials.findFirst({
      where: eq(materials.code, createBomItemDto.materialCode),
      columns: { code: true, materialType: true },
    });

    if (!componentMaterial) {
      throw new NotFoundException(
        translate(
          `Material with code ${createBomItemDto.materialCode} does not exist.`,
          `لا توجد مادة بالكود ${createBomItemDto.materialCode}.`,
        ),
      );
    }

    if (componentMaterial.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL) {
      throw new ConflictException(
        translate(
          `Manufactured material ${createBomItemDto.materialCode} cannot be used as a BOM component.`,
          `لا يمكن استخدام المادة المصنعة ${createBomItemDto.materialCode} كمكون في قائمة المواد.`,
        ),
      );
    }

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
}
