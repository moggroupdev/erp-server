import { Controller, Get, Post, Body, Put, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateAddressDto } from 'src/utils/dto/create-address.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_SUPPLIER)
  @ApiBearerAuth()
  create(@Body() createSupplierDto: CreateSupplierDto, @RequestUser() user: User) {
    return this.suppliersService.create(createSupplierDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIERS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.suppliersService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIERS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.get(id);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_SUPPLIER)
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateSupplierDto: UpdateSupplierDto) {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  // ========================= Addresses =========================

  @Post(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_SUPPLIER)
  @ApiBearerAuth()
  addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() createSupplierAddressDto: CreateAddressDto) {
    return this.suppliersService.addAddress(id, createSupplierAddressDto);
  }

  @Get(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIERS)
  @ApiBearerAuth()
  listAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.listAddresses(id);
  }

  @Put(':id/addresses/:addressId/default')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_SUPPLIER)
  @ApiBearerAuth()
  setDefaultAddress(@Param('id', ParseUUIDPipe) id: string, @Param('addressId', ParseUUIDPipe) addressId: string) {
    return this.suppliersService.setDefaultAddress(id, addressId);
  }
}
