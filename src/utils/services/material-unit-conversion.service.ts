import { and, eq } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialUnitConversions, materials } from 'src/database/schema';
import { type MaterialUnit } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';

@Injectable()
export class MaterialUnitConversionService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  /**
   * Converts a quantity expressed in `unit` into the material's base unit (`materials.unit_of_measurement`).
   * If `unit` is omitted or equals the base unit, returns `quantity` unchanged.
   */
  public async convertToBaseUnit(materialCode: string, quantity: number, unit?: MaterialUnit): Promise<number> {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.code, materialCode),
      columns: { code: true, unitOfMeasurement: true },
    });

    if (!material) {
      throw new NotFoundException(
        translate(`Material with code ${materialCode} does not exist.`, `لا توجد مادة بالكود ${materialCode}.`),
      );
    }

    if (!unit || unit === material.unitOfMeasurement) return quantity;

    const conversion = await this.db.query.materialUnitConversions.findFirst({
      where: and(eq(materialUnitConversions.materialCode, materialCode), eq(materialUnitConversions.unit, unit)),
      columns: { conversionFactorToBase: true },
    });

    if (!conversion) {
      throw new BadRequestException(
        translate(
          `No conversion is defined for unit "${unit}" on material ${materialCode}.`,
          `لا يوجد تحويل لوحدة القياس "${unit}" للمادة ${materialCode}.`,
        ),
      );
    }

    return quantity * Number(conversion.conversionFactorToBase);
  }
}
