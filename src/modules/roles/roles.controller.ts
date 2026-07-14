import { Controller, Get, Post, Body, Put, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_ROLE)
  @ApiBearerAuth()
  create(@Body() createRoleDto: CreateRoleDto, @RequestUser() user: User) {
    return this.rolesService.create(createRoleDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_ROLES)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.rolesService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_ROLES)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.get(id);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_ROLE)
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }
}
