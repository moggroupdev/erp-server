import { Controller, Get, Post, Body, Put, Patch, Delete, Param, ParseUUIDPipe, UseGuards, Query, HttpCode } from '@nestjs/common';
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
import { CreateMaterialUnitConversionDto } from './dto/create-material-unit-conversion.dto';
import { UpdateMaterialUnitConversionDto } from './dto/update-material-unit-conversion.dto';
import { SetMaterialMarketPriceDto } from './dto/set-material-market-price.dto';
import { SetMaterialMarketManufacturingCostDto } from './dto/set-material-market-manufacturing-cost.dto';
import { SetMaterialTypeDto } from './dto/set-material-type.dto';
import { MaterialTypeChangePreviewQueryDto } from './dto/material-type-change-preview-query.dto';
import { DeleteMaterialDto } from './dto/delete-material.dto';
import { MergeMaterialPreviewQueryDto } from './dto/merge-material-preview-query.dto';
import { MergeMaterialDto } from './dto/merge-material.dto';
import { MaterialMergeService } from './material-merge.service';

@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly materialMergeService: MaterialMergeService,
  ) {}

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

  @Get('deleted')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_DELETED_MATERIALS)
  @ApiBearerAuth()
  @ApiListQueries()
  listDeleted(@Query() query: QueryParams) {
    return this.materialsService.listDeleted(query);
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

  @Patch(':code/market-price')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SET_MATERIAL_MARKET_PRICE)
  @ApiBearerAuth()
  setMarketPrice(@Param('code') code: string, @Body() dto: SetMaterialMarketPriceDto, @RequestUser() user: User) {
    return this.materialsService.setMarketPrice(code, dto, user);
  }

  @Patch(':code/market-manufacturing-cost')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SET_MATERIAL_MARKET_PRICE)
  @ApiBearerAuth()
  setMarketManufacturingCost(
    @Param('code') code: string,
    @Body() dto: SetMaterialMarketManufacturingCostDto,
    @RequestUser() user: User,
  ) {
    return this.materialsService.setMarketManufacturingCost(code, dto, user);
  }

  @Get(':code/material-type/impact')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SET_MATERIAL_TYPE)
  @ApiBearerAuth()
  previewTypeChange(@Param('code') code: string, @Query() query: MaterialTypeChangePreviewQueryDto) {
    return this.materialsService.previewTypeChange(code, query.targetType);
  }

  @Patch(':code/material-type')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SET_MATERIAL_TYPE)
  @ApiBearerAuth()
  setType(@Param('code') code: string, @Body() dto: SetMaterialTypeDto) {
    return this.materialsService.setType(code, dto);
  }

  @Get(':code/delete-impact')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.DELETE_MATERIAL)
  @ApiBearerAuth()
  getDeleteImpact(@Param('code') code: string) {
    return this.materialsService.getDeleteImpact(code);
  }

  @Delete(':code')
  @HttpCode(204)
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.DELETE_MATERIAL)
  @ApiBearerAuth()
  delete(@Param('code') code: string, @Body() dto: DeleteMaterialDto, @RequestUser() user: User) {
    return this.materialsService.delete(code, dto, user);
  }

  @Patch(':code/restore')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.RESTORE_MATERIAL)
  @ApiBearerAuth()
  restore(@Param('code') code: string) {
    return this.materialsService.restore(code);
  }

  @Get(':code/merge-preview')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.MERGE_MATERIALS)
  @ApiBearerAuth()
  previewMerge(@Param('code') code: string, @Query() query: MergeMaterialPreviewQueryDto) {
    return this.materialMergeService.preview(code, query.removeCode);
  }

  @Post(':code/merge')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.MERGE_MATERIALS)
  @ApiBearerAuth()
  merge(@Param('code') code: string, @Body() dto: MergeMaterialDto, @RequestUser() user: User) {
    return this.materialMergeService.merge(code, dto, user);
  }

  @Post(':code/units')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_UNIT_CONVERSION)
  @ApiBearerAuth()
  addUnitConversion(@Param('code') code: string, @Body() dto: CreateMaterialUnitConversionDto, @RequestUser() user: User) {
    return this.materialsService.addUnitConversion(code, dto, user);
  }

  @Patch(':code/units/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_UNIT_CONVERSION)
  @ApiBearerAuth()
  updateUnitConversion(
    @Param('code') code: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialUnitConversionDto,
  ) {
    return this.materialsService.updateUnitConversion(code, id, dto);
  }
}
