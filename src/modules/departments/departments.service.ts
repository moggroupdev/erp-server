import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { departments } from 'src/database/schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { translate } from 'src/utils/i18n/translate';

const POPULATION = { manager: { columns: { id: true, name: true } } };

@Injectable()
export class DepartmentsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async create(createDepartmentDto: CreateDepartmentDto) {
    const [department] = await this.db.insert(departments).values(createDepartmentDto).returning();
    return department;
  }

  public async list() {
    return await this.db.query.departments.findMany({ with: POPULATION });
  }

  public async get(id: string) {
    const department = await this.db.query.departments.findFirst({ where: eq(departments.id, id), with: POPULATION });
    if (!department)
      throw new NotFoundException(translate(`Department with ID ${id} does not exist.`, `لا يوجد قسم بالمعرف ${id}.`));
    return department;
  }

  public async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const [updatedDepartment] = await this.db
      .update(departments)
      .set(updateDepartmentDto)
      .where(eq(departments.id, id))
      .returning();
    if (!updatedDepartment)
      throw new NotFoundException(translate(`Department with ID ${id} does not exist.`, `لا يوجد قسم بالمعرف ${id}.`));
    return updatedDepartment;
  }
}
