import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { BomsService } from './boms.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { CreateBomItemDto } from './dto/create-bom-item.dto';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';

@Controller('boms')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_BOM)
  @ApiBearerAuth()
  create(@Body() createBomDto: CreateBomDto, @RequestUser() user: User) {
    return this.bomsService.create(createBomDto, user);
  }

  @Post(':dimensionId/items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_PRODUCT_BOM)
  @ApiBearerAuth()
  appendItem(
    @Param('dimensionId', ParseUUIDPipe) dimensionId: string,
    @Body() createBomItemDto: CreateBomItemDto,
    @RequestUser() user: User,
  ) {
    return this.bomsService.appendItem(dimensionId, createBomItemDto, user);
  }

  @Get(':dimensionId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCT_BOMS)
  @ApiBearerAuth()
  get(@Param('dimensionId', ParseUUIDPipe) dimensionId: string) {
    return this.bomsService.get(dimensionId);
  }

  @Patch('items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCT_BOM)
  @ApiBearerAuth()
  updateItem(@Param('itemId', ParseUUIDPipe) itemId: string, @Body() updateBomItemDto: UpdateBomItemDto) {
    return this.bomsService.updateItem(itemId, updateBomItemDto);
  }
}
