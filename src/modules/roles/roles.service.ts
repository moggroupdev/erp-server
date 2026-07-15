import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { permissions, roles } from 'src/database/schema';
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

    return { ...role, permissions: role.permissions.map((p) => p.permission) };
  }

  public async update(id: string, updateRoleDto: UpdateRoleDto) {
    const { permissions: permissionValues, ...roleData } = updateRoleDto;

    const updatedRole = await this.db.transaction(async (tx) => {
      // if (Object.keys(roleData).length > 0)
      const [updatedRole] = await tx.update(roles).set(roleData).where(eq(roles.id, id)).returning();

      // @TODO: Enhance this logic to check if the permissions are changed or they are the same as the previous ones.
      if (permissionValues !== undefined) {
        await tx.delete(permissions).where(eq(permissions.roleId, id));
        if (permissionValues.length > 0)
          await tx.insert(permissions).values(permissionValues.map((permission) => ({ roleId: id, permission })));
      }

      return updatedRole;
    });

    return updatedRole;
  }
}
