import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialPurchaseOrdersService } from './material-purchase-orders.service';
import { CreateMaterialPurchaseOrderDto } from './dto/create-material-purchase-order.dto';

@Controller('material-purchase-orders')
export class MaterialPurchaseOrdersController {
  constructor(private readonly materialPurchaseOrdersService: MaterialPurchaseOrdersService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_PURCHASE_ORDER)
  @ApiBearerAuth()
  create(@Body() createDto: CreateMaterialPurchaseOrderDto, @RequestUser() user: User) {
    return this.materialPurchaseOrdersService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_ORDERS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.materialPurchaseOrdersService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_ORDERS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialPurchaseOrdersService.get(id);
  }
}
