import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Query,
  HttpCode,
  Header,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductDimensionDto } from './dto/create-product-dimension.dto';
import { ProductsRenderer } from './products.renderer';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsRenderer: ProductsRenderer,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT)
  @ApiBearerAuth()
  create(@Body() createProductDto: CreateProductDto, @RequestUser() user: User) {
    return this.productsService.create(createProductDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCTS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.productsService.list(query);
  }

  // Not protected endpoint
  @Get('catalog')
  @Header('Content-Type', 'text/html; charset=utf-8')
  catalog(): Promise<string> {
    return this.productsRenderer.renderCatatlog();
  }

  @Get(':code')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCTS)
  @ApiBearerAuth()
  get(@Param('code') code: string) {
    return this.productsService.get(code);
  }

  @Put(':code')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT)
  @ApiBearerAuth()
  update(@Param('code') code: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(code, updateProductDto);
  }

  // ========================= Dimensions =========================

  @Post(':code/dimensions')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT)
  @ApiBearerAuth()
  addDimension(
    @Param('code') code: string,
    @Body() createProductDimensionDto: CreateProductDimensionDto,
    @RequestUser() user: User,
  ) {
    return this.productsService.addDimension(code, createProductDimensionDto, user);
  }

  @Get(':code/dimensions')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCTS)
  @ApiBearerAuth()
  listDimensions(@Param('code') code: string) {
    return this.productsService.listDimensions(code);
  }

  @Put(':code/dimensions/:dimensionId/default')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT)
  @ApiBearerAuth()
  setDefaultDimension(@Param('code') code: string, @Param('dimensionId', ParseUUIDPipe) dimensionId: string) {
    return this.productsService.setDefaultDimension(code, dimensionId);
  }
}
