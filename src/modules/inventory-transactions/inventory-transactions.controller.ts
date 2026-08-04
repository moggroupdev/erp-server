import { Controller, Get, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { InventoryTransactionsService } from './inventory-transactions.service';

@Controller('inventory-transactions')
export class InventoryTransactionsController {
  constructor(private readonly inventoryTransactionsService: InventoryTransactionsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_INVENTORY_TRANSACTIONS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.inventoryTransactionsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_INVENTORY_TRANSACTIONS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryTransactionsService.get(id);
  }
}
