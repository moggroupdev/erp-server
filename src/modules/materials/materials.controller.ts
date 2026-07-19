import { Controller, Get, Post, Body, Put, Param, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL)
  @ApiBearerAuth()
  create(@Body() createMaterialDto: CreateMaterialDto, @RequestUser() user: User) {
    return this.materialsService.create(createMaterialDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIALS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.materialsService.list(query);
  }

  @Get(':code')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIALS)
  @ApiBearerAuth()
  get(@Param('code') code: string) {
    return this.materialsService.get(code);
  }

  @Put(':code')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL)
  @ApiBearerAuth()
  update(@Param('code') code: string, @Body() updateMaterialDto: UpdateMaterialDto) {
    return this.materialsService.update(code, updateMaterialDto);
  }
}
