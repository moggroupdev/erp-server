import { eq } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { productionSubDepartmentManagers } from 'src/database/schema';
import { PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type ProductionSubDepartment } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { AssignProductionDepartmentManagerDto } from './dto/assign-production-department-manager.dto';

const POPULATION = {
  manager: { columns: { id: true, name: true } },
  deputyManager: { columns: { id: true, name: true } },
};

@Injectable()
export class ProductionDepartmentManagersService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async list() {
    const rows = await this.db.query.productionSubDepartmentManagers.findMany({ with: POPULATION });
    const byDepartment = new Map(rows.map((row) => [row.subDepartment, row]));

    return PRODUCTION_SUB_DEPARTMENT_VALUES.map((department) => {
      const existing = byDepartment.get(department);
      if (existing) {
        return {
          department: existing.subDepartment,
          managerId: existing.managerId,
          deputyManagerId: existing.deputyManagerId,
          manager: existing.manager,
          deputyManager: existing.deputyManager,
        };
      }

      return {
        department,
        managerId: null,
        deputyManagerId: null,
        manager: null,
        deputyManager: null,
      };
    });
  }

  public async assign(department: string, dto: AssignProductionDepartmentManagerDto) {
    if (!PRODUCTION_SUB_DEPARTMENT_VALUES.includes(department as ProductionSubDepartment)) {
      throw new BadRequestException(
        translate(
          `Production department \`${department}\` is not valid.`,
          `قسم الإنتاج \`${department}\` غير صالح.`,
        ),
      );
    }

    const managerId = dto.managerId ?? null;
    const deputyManagerId = dto.deputyManagerId ?? null;

    if (managerId && deputyManagerId && managerId === deputyManagerId) {
      throw new BadRequestException(
        translate(
          'Manager and deputy manager must be different users.',
          'يجب أن يكون المدير ونائب المدير مستخدمين مختلفين.',
        ),
      );
    }

    await this.db
      .insert(productionSubDepartmentManagers)
      .values({
        subDepartment: department as ProductionSubDepartment,
        managerId,
        deputyManagerId,
      })
      .onConflictDoUpdate({
        target: productionSubDepartmentManagers.subDepartment,
        set: { managerId, deputyManagerId },
      });

    const assignment = await this.db.query.productionSubDepartmentManagers.findFirst({
      where: eq(productionSubDepartmentManagers.subDepartment, department as ProductionSubDepartment),
      with: POPULATION,
    });

    if (!assignment) return null;

    return {
      department: assignment.subDepartment,
      managerId: assignment.managerId,
      deputyManagerId: assignment.deputyManagerId,
      manager: assignment.manager,
      deputyManager: assignment.deputyManager,
    };
  }
}
