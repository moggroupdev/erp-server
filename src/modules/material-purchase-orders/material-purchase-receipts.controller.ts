import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialPurchaseReceiptsService } from './material-purchase-receipts.service';
import { CreateMaterialPurchaseReceiptDto } from './dto/create-material-purchase-receipt.dto';

@Controller('material-purchase-receipts')
export class MaterialPurchaseReceiptsController {
  constructor(private readonly materialPurchaseReceiptsService: MaterialPurchaseReceiptsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_PURCHASE_RECEIPT)
  @ApiBearerAuth()
  create(@Body() createDto: CreateMaterialPurchaseReceiptDto, @RequestUser() user: User) {
    return this.materialPurchaseReceiptsService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_ORDERS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.materialPurchaseReceiptsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_ORDERS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialPurchaseReceiptsService.get(id);
  }
}
