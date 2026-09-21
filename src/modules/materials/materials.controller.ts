import { Controller, Get, Post, Body, Put, Patch, Param, UseGuards, Query } from '@nestjs/common';
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
import { SetMaterialMarketPriceDto } from './dto/set-material-market-price.dto';
import { SetMaterialTypeDto } from './dto/set-material-type.dto';
import { MaterialTypeChangePreviewQueryDto } from './dto/material-type-change-preview-query.dto';

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

  @Patch(':code/market-price')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SET_MATERIAL_MARKET_PRICE)
  @ApiBearerAuth()
  setMarketPrice(@Param('code') code: string, @Body() dto: SetMaterialMarketPriceDto, @RequestUser() user: User) {
    return this.materialsService.setMarketPrice(code, dto, user);
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

  @Post(':code/units')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL)
  @ApiBearerAuth()
  addUnitConversion(@Param('code') code: string, @Body() dto: CreateMaterialUnitConversionDto, @RequestUser() user: User) {
    return this.materialsService.addUnitConversion(code, dto, user);
  }
}
