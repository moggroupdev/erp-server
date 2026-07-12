import { Controller, Get, Post, Body, Put, Param, ParseUUIDPipe, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreateVendorAddressDto } from './dto/create-vendor-address.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_VENDOR)
  @ApiBearerAuth()
  create(@Body() createVendorDto: CreateVendorDto, @RequestUser() user: User) {
    return this.vendorsService.create(createVendorDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_VENDORS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.vendorsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_VENDORS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.get(id);
  }

  @Get(':id/with-addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_VENDORS)
  @ApiBearerAuth()
  getWithAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getWithAddresses(id);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_VENDOR)
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateVendorDto: UpdateVendorDto) {
    return this.vendorsService.update(id, updateVendorDto);
  }

  @Post(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_VENDOR)
  @ApiBearerAuth()
  addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() createVendorAddressDto: CreateVendorAddressDto) {
    return this.vendorsService.addAddress(id, createVendorAddressDto);
  }

  @Get(':id/addresses')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_VENDORS)
  @ApiBearerAuth()
  getAddresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getAddresses(id);
  }
}
