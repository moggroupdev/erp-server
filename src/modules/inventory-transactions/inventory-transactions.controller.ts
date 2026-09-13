import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { InventoryTransactionsService } from './inventory-transactions.service';
import { CreateInventoryTransactionFromMaterialPurchaseReceiptDto } from './dto/create-inventory-transaction-from-material-purchase-receipt.dto';

@Controller('inventory-transactions')
export class InventoryTransactionsController {
  constructor(private readonly inventoryTransactionsService: InventoryTransactionsService) {}

  @Post('from-material-purchase-receipt/:receiptId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_INVENTORY_TRANSACTION)
  @ApiBearerAuth()
  createFromMaterialPurchaseReceipt(
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() dto: CreateInventoryTransactionFromMaterialPurchaseReceiptDto,
    @RequestUser() user: User,
  ) {
    return this.inventoryTransactionsService.createFromMaterialPurchaseReceipt(receiptId, dto, user);
  }

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
