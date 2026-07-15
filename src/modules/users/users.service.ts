import bcrypt from 'bcryptjs';
import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { roles, users } from 'src/database/schema';
import { PRODUCTION_DEPARTMENT_ID } from 'src/utils/constants';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Get all columns of the users table except the password column
const { password: _password, ...userColumnsWithoutPassword } = getTableColumns(users);

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createUserDto: CreateUserDto, user: User) {
    const email = createUserDto.email || null;
    const phone = createUserDto.phone || null;
    const departmentId = createUserDto.departmentId || null;
    const productionSubDepartment = createUserDto.productionSubDepartment || null;

    this.validateUserFields({
      email,
      phone,
      departmentId,
      productionSubDepartment,
      isAdmin: false,
      roleId: createUserDto.roleId,
    });

    if (departmentId) await this.validateRoleDepartment(createUserDto.roleId, departmentId);

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const [newUser] = await this.db
      .insert(users)
      .values({
        code: sql`DEFAULT`,
        name: createUserDto.name,
        email,
        phone,
        password: hashedPassword,
        departmentId,
        productionSubDepartment,
        roleId: createUserDto.roleId,
        createdBy: user.id,
      })
      .returning(userColumnsWithoutPassword);

    return newUser;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(users, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      columns: { password: false },
      additionalConditions: [isNull(users.deletedAt)],
    });
  }

  // We allow the `get` method to return a deleted user too
  public async get(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { password: false },
      with: { createdBy: { columns: { id: true, name: true } } },
    });
    if (!user) throw new NotFoundException(translate(`User with ID ${id} does not exist.`, `لا يوجد مستخدم بالمعرف ${id}.`));
    return user;
  }

  public async update(id: string, updateUserDto: UpdateUserDto) {
    const existing = await this.db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) });

    if (!existing)
      throw new NotFoundException(translate(`User with ID ${id} does not exist.`, `لا يوجد مستخدم بالمعرف ${id}.`));

    const email = updateUserDto.email !== undefined ? updateUserDto.email : existing.email;
    const phone = updateUserDto.phone !== undefined ? updateUserDto.phone : existing.phone;
    const departmentId = updateUserDto.departmentId !== undefined ? updateUserDto.departmentId : existing.departmentId;
    const productionSubDepartment =
      updateUserDto.productionSubDepartment !== undefined
        ? updateUserDto.productionSubDepartment
        : existing.productionSubDepartment;
    const roleId = updateUserDto.roleId !== undefined ? updateUserDto.roleId : existing.roleId;

    this.validateUserFields({
      email,
      phone,
      departmentId,
      productionSubDepartment,
      isAdmin: existing.isAdmin,
      roleId,
    });

    if (roleId && departmentId) await this.validateRoleDepartment(roleId, departmentId);

    const { password, ...rest } = updateUserDto;

    const setValues: Partial<typeof users.$inferInsert> = { ...rest, roleId: existing.isAdmin ? null : roleId };

    // Only write unique fields when they actually change (avoids false unique conflicts)
    if (updateUserDto.phone !== undefined && updateUserDto.phone === existing.phone) delete setValues.phone;
    if (updateUserDto.email !== undefined && updateUserDto.email === existing.email) delete setValues.email;

    if (password !== undefined) setValues.password = await bcrypt.hash(password, 12);

    const [updatedUser] = await this.db
      .update(users)
      .set(setValues)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning(userColumnsWithoutPassword);

    if (!updatedUser)
      throw new NotFoundException(translate(`User with ID ${id} does not exist.`, `لا يوجد مستخدم بالمعرف ${id}.`));

    return updatedUser;
  }

  public async delete(id: string) {
    const [deletedUser] = await this.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();

    if (!deletedUser)
      throw new NotFoundException(translate(`User with ID ${id} does not exist.`, `لا يوجد مستخدم بالمعرف ${id}.`));
  }

  // ========================= Private Methods =========================

  private validateUserFields(fields: {
    email: string | null;
    phone: string | null;
    departmentId: string | null;
    productionSubDepartment: string | null;
    isAdmin: boolean;
    roleId: string | null;
  }) {
    const { email, phone, isAdmin, roleId, departmentId, productionSubDepartment } = fields;

    if (!email && !phone)
      throw new BadRequestException(
        translate('Either email or phone must be provided.', 'يجب إدخال البريد الإلكتروني أو رقم الهاتف.'),
      );

    if (isAdmin && roleId !== null)
      throw new BadRequestException(translate("You can't assign a role to an admin.", 'لا يمكن تعيين دور لمستخدم مسؤول.'));

    if (!isAdmin && roleId === null)
      throw new BadRequestException(translate('User role is required.', 'يجب أن يكون للمستخدم دور.'));

    if (departmentId === PRODUCTION_DEPARTMENT_ID) {
      if (!productionSubDepartment)
        throw new BadRequestException(
          translate(
            'Production sub-department is required when the department is Production.',
            'القسم الفرعي للإنتاج مطلوب عندما يكون القسم هو الإنتاج.',
          ),
        );
    } else if (productionSubDepartment !== null) {
      throw new BadRequestException(
        translate(
          'Production sub-department is only allowed when the department is Production.',
          'القسم الفرعي للإنتاج مسموح به فقط عندما يكون القسم هو الإنتاج.',
        ),
      );
    }
  }

  /** When the role is department-scoped, the user's department must match. Unscoped roles are allowed. */
  private async validateRoleDepartment(roleId: string, departmentId: string | null) {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
      columns: { id: true, departmentId: true },
    });

    if (!role)
      throw new BadRequestException(translate(`Role with ID ${roleId} does not exist.`, `لا يوجد دور بالمعرف ${roleId}.`));

    if (role.departmentId === null) return;

    if (departmentId !== role.departmentId)
      throw new BadRequestException(
        translate(
          `The selected role is not listed in the selected department.`,
          'الدور المحدد غير مدرج في القسم الذي تم تحديده.',
        ),
      );
  }
}
