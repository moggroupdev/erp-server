import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { type ProductionSubDepartment, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { BomsService } from './boms.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomItemDto } from './dto/create-bom-item.dto';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { ReplaceDepartmentBomDto } from './dto/replace-department-bom.dto';

@Controller('boms')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Post(':dimensionId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_BOM)
  @ApiBearerAuth()
  create(
    @Param('dimensionId', ParseUUIDPipe) dimensionId: string,
    @Body() createBomDto: CreateBomDto,
    @RequestUser() user: User,
  ) {
    return this.bomsService.create(dimensionId, createBomDto, user);
  }

  @Get(':dimensionId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCT_BOMS)
  @ApiBearerAuth()
  get(@Param('dimensionId', ParseUUIDPipe) dimensionId: string, @RequestUser() user: User) {
    return this.bomsService.get(dimensionId, user);
  }

  @Post(':dimensionId/append')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_BOM)
  @ApiBearerAuth()
  appendItem(
    @Param('dimensionId', ParseUUIDPipe) dimensionId: string,
    @Body() createBomItemDto: CreateBomItemDto,
    @RequestUser() user: User,
  ) {
    return this.bomsService.appendItem(dimensionId, createBomItemDto, user);
  }

  @Put(':dimensionId/department/:productionSubDepartment')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_BOM)
  @ApiBearerAuth()
  replaceDepartment(
    @Param('dimensionId', ParseUUIDPipe) dimensionId: string,
    @Param('productionSubDepartment') productionSubDepartment: string,
    @Body() replaceDto: ReplaceDepartmentBomDto,
    @RequestUser() user: User,
  ) {
    return this.bomsService.replaceDepartment(
      dimensionId,
      productionSubDepartment as ProductionSubDepartment,
      replaceDto,
      user,
    );
  }

  @Patch(':itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_BOM)
  @ApiBearerAuth()
  updateItem(@Param('itemId', ParseUUIDPipe) itemId: string, @Body() updateBomItemDto: UpdateBomItemDto) {
    return this.bomsService.updateItem(itemId, updateBomItemDto);
  }

  @Delete(':dimensionId/all')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_BOM)
  @ApiBearerAuth()
  deleteAll(@Param('dimensionId', ParseUUIDPipe) dimensionId: string) {
    return this.bomsService.deleteAll(dimensionId);
  }

  @Delete(':itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_BOM)
  @ApiBearerAuth()
  deleteItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.bomsService.deleteItem(itemId);
  }
}
