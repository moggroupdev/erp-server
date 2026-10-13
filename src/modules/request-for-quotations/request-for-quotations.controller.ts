import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { RequestForQuotationsService } from './request-for-quotations.service';
import { CreateRequestForQuotationDto } from './dto/create-request-for-quotation.dto';
import { UpdateRequestForQuotationDto } from './dto/update-request-for-quotation.dto';
import { CreateRequestForQuotationItemDto } from './dto/create-request-for-quotation-item.dto';
import { UpdateRequestForQuotationItemDto } from './dto/update-request-for-quotation-item.dto';
import { CreateSupplierQuotationDto } from './dto/create-supplier-quotation.dto';
import { UpdateSupplierQuotationDto } from './dto/update-supplier-quotation.dto';
import { CreateSupplierQuotationItemDto } from './dto/create-supplier-quotation-item.dto';
import { UpdateSupplierQuotationItemDto } from './dto/update-supplier-quotation-item.dto';

@Controller('request-for-quotations')
export class RequestForQuotationsController {
  constructor(private readonly requestForQuotationsService: RequestForQuotationsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  create(@Body() createDto: CreateRequestForQuotationDto, @RequestUser() user: User) {
    return this.requestForQuotationsService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_REQUEST_FOR_QUOTATIONS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.requestForQuotationsService.list(query);
  }

  @Get('quotation-items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_REQUEST_FOR_QUOTATIONS)
  @ApiBearerAuth()
  listQuotationItems(@Query('supplierId') supplierId?: string, @Query('materialCode') materialCode?: string) {
    return this.requestForQuotationsService.listQuotationItems(supplierId, materialCode);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_REQUEST_FOR_QUOTATIONS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestForQuotationsService.get(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  updateHeader(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateRequestForQuotationDto) {
    return this.requestForQuotationsService.updateHeader(id, updateDto);
  }

  @Post(':id/items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() createDto: CreateRequestForQuotationItemDto) {
    return this.requestForQuotationsService.addItem(id, createDto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() updateDto: UpdateRequestForQuotationItemDto,
  ) {
    return this.requestForQuotationsService.updateItem(id, itemId, updateDto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.requestForQuotationsService.deleteItem(id, itemId);
  }

  @Post(':id/close')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestForQuotationsService.close(id);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestForQuotationsService.cancel(id);
  }

  @Post(':id/supplier-quotations')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  inviteSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createDto: CreateSupplierQuotationDto,
    @RequestUser() user: User,
  ) {
    return this.requestForQuotationsService.inviteSupplier(id, createDto, user);
  }

  @Patch(':id/supplier-quotations/:quotationId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  updateQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() updateDto: UpdateSupplierQuotationDto,
  ) {
    return this.requestForQuotationsService.updateQuotation(id, quotationId, updateDto);
  }

  @Post(':id/supplier-quotations/:quotationId/items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  addQuotationItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() createDto: CreateSupplierQuotationItemDto,
  ) {
    return this.requestForQuotationsService.addQuotationItem(id, quotationId, createDto);
  }

  @Patch(':id/supplier-quotations/:quotationId/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  updateQuotationItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() updateDto: UpdateSupplierQuotationItemDto,
  ) {
    return this.requestForQuotationsService.updateQuotationItem(id, quotationId, itemId, updateDto);
  }

  @Delete(':id/supplier-quotations/:quotationId/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_REQUEST_FOR_QUOTATION)
  @ApiBearerAuth()
  deleteQuotationItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.requestForQuotationsService.deleteQuotationItem(id, quotationId, itemId);
  }
}
