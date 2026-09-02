import { Controller, Get, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialPurchaseReceiptsService } from './material-purchase-receipts.service';

@Controller('material-purchase-receipts')
export class MaterialPurchaseReceiptsController {
  constructor(private readonly materialPurchaseReceiptsService: MaterialPurchaseReceiptsService) {}

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
