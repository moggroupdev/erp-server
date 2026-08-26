import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialPurchaseRequisitionsService } from './material-purchase-requisitions.service';
import { CreateMaterialPurchaseRequisitionDto } from './dto/create-material-purchase-requisition.dto';
import { CreateMaterialPurchaseRequisitionItemDto } from './dto/create-material-purchase-requisition-item.dto';
import { UpdateMaterialPurchaseRequisitionDto } from './dto/update-material-purchase-requisition.dto';
import { UpdateMaterialPurchaseRequisitionItemDto } from './dto/update-material-purchase-requisition-item.dto';
import { RejectMaterialPurchaseRequisitionDto } from './dto/reject-material-purchase-requisition.dto';

@Controller('material-purchase-requisitions')
export class MaterialPurchaseRequisitionsController {
  constructor(private readonly materialPurchaseRequisitionsService: MaterialPurchaseRequisitionsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  create(@Body() createDto: CreateMaterialPurchaseRequisitionDto, @RequestUser() user: User) {
    return this.materialPurchaseRequisitionsService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_REQUISITIONS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.materialPurchaseRequisitionsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASE_REQUISITIONS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialPurchaseRequisitionsService.get(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  updateHeader(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateMaterialPurchaseRequisitionDto) {
    return this.materialPurchaseRequisitionsService.updateHeader(id, updateDto);
  }

  @Post(':id/items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() createDto: CreateMaterialPurchaseRequisitionItemDto) {
    return this.materialPurchaseRequisitionsService.addItem(id, createDto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() updateDto: UpdateMaterialPurchaseRequisitionItemDto,
  ) {
    return this.materialPurchaseRequisitionsService.updateItem(id, itemId, updateDto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.materialPurchaseRequisitionsService.deleteItem(id, itemId);
  }

  @Post(':id/approve-planning')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.APPROVE_MATERIAL_PURCHASE_REQUISITION_PLANNING)
  @ApiBearerAuth()
  approvePlanning(@Param('id', ParseUUIDPipe) id: string, @RequestUser() user: User) {
    return this.materialPurchaseRequisitionsService.approvePlanning(id, user);
  }

  @Post(':id/approve-purchasing-manager')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.APPROVE_MATERIAL_PURCHASE_REQUISITION_PURCHASING_MANAGER)
  @ApiBearerAuth()
  approvePurchasingManager(@Param('id', ParseUUIDPipe) id: string, @RequestUser() user: User) {
    return this.materialPurchaseRequisitionsService.approvePurchasingManager(id, user);
  }

  @Post(':id/approve-director')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.APPROVE_MATERIAL_PURCHASE_REQUISITION_DIRECTOR)
  @ApiBearerAuth()
  approveDirector(@Param('id', ParseUUIDPipe) id: string, @RequestUser() user: User) {
    return this.materialPurchaseRequisitionsService.approveDirector(id, user);
  }

  @Post(':id/reject')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.REJECT_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectDto: RejectMaterialPurchaseRequisitionDto,
    @RequestUser() user: User,
  ) {
    return this.materialPurchaseRequisitionsService.reject(id, rejectDto, user);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.CANCEL_MATERIAL_PURCHASE_REQUISITION)
  @ApiBearerAuth()
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialPurchaseRequisitionsService.cancel(id);
  }
}
