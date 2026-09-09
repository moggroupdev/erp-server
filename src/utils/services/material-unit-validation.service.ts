import { and, inArray, isNull } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materials, materialUnitConversions } from 'src/database/schema';
import { translate } from 'src/utils/i18n/translate';
import { type MaterialUnit } from 'src/utils/types';

@Injectable()
export class MaterialUnitValidationService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async assertValidSelectedUnits(items: { materialCode: string; unitOfMeasurementSelected: MaterialUnit }[]) {
    const uniqueCodes = [...new Set(items.map((item) => item.materialCode))];
    const found = await this.db.query.materials.findMany({
      where: and(inArray(materials.code, uniqueCodes), isNull(materials.deletedAt)),
      columns: { code: true, unitOfMeasurement: true },
    });

    const byCode = new Map(found.map((row) => [row.code, row]));
    const missing = uniqueCodes.filter((code) => !byCode.has(code));

    if (missing.length > 0) {
      throw new NotFoundException(
        translate(`Material(s) not found: ${missing.join(', ')}.`, `المواد غير موجودة: ${missing.join(', ')}.`),
      );
    }

    const conversions = await this.db.query.materialUnitConversions.findMany({
      where: inArray(materialUnitConversions.materialCode, uniqueCodes),
      columns: { materialCode: true, unit: true },
    });

    const allowedByCode = new Map<string, Set<string>>();
    for (const material of found) {
      allowedByCode.set(material.code, new Set([material.unitOfMeasurement]));
    }
    for (const conversion of conversions) {
      allowedByCode.get(conversion.materialCode)?.add(conversion.unit);
    }

    for (const item of items) {
      const allowed = allowedByCode.get(item.materialCode);
      if (!allowed?.has(item.unitOfMeasurementSelected)) {
        throw new BadRequestException(
          translate(
            `Unit "${item.unitOfMeasurementSelected}" is not valid for material ${item.materialCode}.`,
            `الوحدة "${item.unitOfMeasurementSelected}" غير صالحة للمادة ${item.materialCode}.`,
          ),
        );
      }
    }
  }
}
