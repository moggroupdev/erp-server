import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from 'src/utils/constants';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryMainDto } from './dto/create-category-main.dto';
import { UpdateCategoryMainDto } from './dto/update-category-main.dto';
import { CreateCategorySubDto } from './dto/create-category-sub.dto';
import { UpdateCategorySubDto } from './dto/update-category-sub.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  getAllCategories() {
    return this.categoriesService.getAllCategories();
  }

  @Get('material-categories')
  getMaterialCategories() {
    return this.categoriesService.getMaterialCategories();
  }

  @Get('product-categories')
  getProductCategories() {
    return this.categoriesService.getProductCategories();
  }

  @Get('material-category-mains')
  getMaterialCategoryMains() {
    return this.categoriesService.getMaterialCategoryMains();
  }

  @Get('material-category-subs')
  getMaterialCategorySubs() {
    return this.categoriesService.getMaterialCategorySubs();
  }

  @Get('product-category-mains')
  getProductCategoryMains() {
    return this.categoriesService.getProductCategoryMains();
  }

  @Get('product-category-subs')
  getProductCategorySubs() {
    return this.categoriesService.getProductCategorySubs();
  }

  // ========================= Material mains =========================

  @Post('material-category-mains')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_CATEGORY)
  @ApiBearerAuth()
  createMaterialCategoryMain(@Body() dto: CreateCategoryMainDto) {
    return this.categoriesService.createMain('material', dto);
  }

  @Put('material-category-mains/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_CATEGORY)
  @ApiBearerAuth()
  updateMaterialCategoryMain(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryMainDto) {
    return this.categoriesService.updateMain('material', id, dto);
  }

  // ========================= Material subs =========================

  @Post('material-category-subs')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_CATEGORY)
  @ApiBearerAuth()
  createMaterialCategorySub(@Body() dto: CreateCategorySubDto) {
    return this.categoriesService.createSub('material', dto);
  }

  @Put('material-category-subs/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_CATEGORY)
  @ApiBearerAuth()
  updateMaterialCategorySub(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategorySubDto) {
    return this.categoriesService.updateSub('material', id, dto);
  }

  // ========================= Product mains =========================

  @Post('product-category-mains')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_CATEGORY)
  @ApiBearerAuth()
  createProductCategoryMain(@Body() dto: CreateCategoryMainDto) {
    return this.categoriesService.createMain('product', dto);
  }

  @Put('product-category-mains/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_CATEGORY)
  @ApiBearerAuth()
  updateProductCategoryMain(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryMainDto) {
    return this.categoriesService.updateMain('product', id, dto);
  }

  // ========================= Product subs =========================

  @Post('product-category-subs')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_CATEGORY)
  @ApiBearerAuth()
  createProductCategorySub(@Body() dto: CreateCategorySubDto) {
    return this.categoriesService.createSub('product', dto);
  }

  @Put('product-category-subs/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_CATEGORY)
  @ApiBearerAuth()
  updateProductCategorySub(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategorySubDto) {
    return this.categoriesService.updateSub('product', id, dto);
  }
}
