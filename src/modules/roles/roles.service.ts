import { and, count, eq, inArray } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { permissions, roles, users } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createRoleDto: CreateRoleDto, user: User) {
    const { permissions: permissionValues, ...roleData } = createRoleDto;

    const role = await this.db.transaction(async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ ...roleData, createdBy: user.id })
        .returning();

      if (permissionValues.length > 0)
        await tx.insert(permissions).values(permissionValues.map((permission) => ({ roleId: role.id, permission })));

      return role;
    });

    return role;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(roles, queryParams, {
      filtering: true,
      searchableFields: ['name', 'description'],
      fieldLimiting: true,
      sorting: true,
    });
  }

  public async get(id: string) {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.id, id),
      with: { createdBy: { columns: { id: true, name: true } }, permissions: true },
    });

    if (!role) throw new NotFoundException(translate(`Role with ID ${id} does not exist.`, `لا يوجد دور بالمعرف ${id}.`));

    const [{ assignedUserCount }] = await this.db
      .select({ assignedUserCount: count() })
      .from(users)
      .where(eq(users.roleId, id));

    return {
      ...role,
      permissions: role.permissions.map((p) => p.permission),
      assignedUserCount,
    };
  }

  public async update(id: string, updateRoleDto: UpdateRoleDto) {
    const { permissions: permissionValues, ...roleData } = updateRoleDto;

    const updatedRole = await this.db.transaction(async (tx) => {
      // if (Object.keys(roleData).length > 0)
      const [updatedRole] = await tx.update(roles).set(roleData).where(eq(roles.id, id)).returning();

      if (permissionValues !== undefined) {
        const existingRows = await tx
          .select({ permission: permissions.permission })
          .from(permissions)
          .where(eq(permissions.roleId, id));

        const existing = new Set(existingRows.map((row) => row.permission));
        const incoming = new Set(permissionValues);

        const toDelete = [...existing].filter((permission) => !incoming.has(permission));
        const toInsert = permissionValues.filter((permission) => !existing.has(permission));

        if (toDelete.length > 0)
          await tx.delete(permissions).where(and(eq(permissions.roleId, id), inArray(permissions.permission, toDelete)));

        if (toInsert.length > 0)
          await tx.insert(permissions).values(toInsert.map((permission) => ({ roleId: id, permission })));
      }

      return updatedRole;
    });

    return updatedRole;
  }

  public async delete(id: string) {
    await this.db.transaction(async (tx) => {
      const existing = await tx.query.roles.findFirst({
        where: eq(roles.id, id),
        columns: { id: true },
      });

      if (!existing)
        throw new NotFoundException(translate(`Role with ID ${id} does not exist.`, `لا يوجد دور بالمعرف ${id}.`));

      const [{ assignedUserCount }] = await tx
        .select({ assignedUserCount: count() })
        .from(users)
        .where(eq(users.roleId, id));

      if (assignedUserCount > 0)
        throw new ConflictException(
          translate(
            'This role cannot be deleted because users are still assigned to it.',
            'لا يمكن حذف هذا الدور لأن مستخدمين ما زالوا معيّنين إليه.',
          ),
        );

      await tx.delete(permissions).where(eq(permissions.roleId, id));
      await tx.delete(roles).where(eq(roles.id, id));
    });
  }
}
