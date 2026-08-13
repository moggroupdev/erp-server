import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { LegacyInventoryTransactionsService } from './legacy-inventory-transactions.service';
import { CreateLegacyInventoryTransactionDto } from './dto/create-legacy-inventory-transaction.dto';
import { UpdateLegacyInventoryTransactionDto } from './dto/update-legacy-inventory-transaction.dto';
import { UpdateLegacyInventoryTransactionItemDto } from './dto/update-legacy-inventory-transaction-item.dto';

@Controller('legacy-inventory-transactions')
export class LegacyInventoryTransactionsController {
  constructor(private readonly legacyInventoryTransactionsService: LegacyInventoryTransactionsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_INVENTORY_TRANSACTION)
  @ApiBearerAuth()
  create(@Body() createDto: CreateLegacyInventoryTransactionDto, @RequestUser() user: User) {
    return this.legacyInventoryTransactionsService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_LEGACY_INVENTORY_TRANSACTIONS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.legacyInventoryTransactionsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_LEGACY_INVENTORY_TRANSACTIONS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.legacyInventoryTransactionsService.get(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_INVENTORY_TRANSACTION)
  @ApiBearerAuth()
  updateHeader(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateLegacyInventoryTransactionDto) {
    return this.legacyInventoryTransactionsService.updateHeader(id, updateDto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_INVENTORY_TRANSACTION)
  @ApiBearerAuth()
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() updateDto: UpdateLegacyInventoryTransactionItemDto,
  ) {
    return this.legacyInventoryTransactionsService.updateItem(id, itemId, updateDto);
  }
}
