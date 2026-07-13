import { Controller, Get, Post, Body, Put, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_CUSTOMER)
  @ApiBearerAuth()
  create(@Body() createCustomerDto: CreateCustomerDto, @RequestUser() user: User) {
    return this.customersService.create(createCustomerDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_CUSTOMERS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.customersService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_CUSTOMERS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.get(id);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_CUSTOMER)
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(id, updateCustomerDto);
  }

  // ========================= Addresses =========================

  @Post(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_CUSTOMER)
  @ApiBearerAuth()
  addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() createCustomerAddressDto: CreateCustomerAddressDto) {
    return this.customersService.addAddress(id, createCustomerAddressDto);
  }

  @Get(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_CUSTOMERS)
  @ApiBearerAuth()
  listAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.listAddresses(id);
  }

  @Put(':id/addresses/:addressId/default')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_CUSTOMER)
  @ApiBearerAuth()
  setDefaultAddress(@Param('id', ParseUUIDPipe) id: string, @Param('addressId', ParseUUIDPipe) addressId: string) {
    return this.customersService.setDefaultAddress(id, addressId);
  }
}
