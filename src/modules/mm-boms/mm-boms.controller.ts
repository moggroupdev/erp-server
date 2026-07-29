import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { MmBomsService } from './mm-boms.service';
import { CreateMmBomItemDto } from './dto/create-mm-bom-item.dto';
import { UpdateMmBomItemDto } from './dto/update-mm-bom-item.dto';

@Controller('mm-boms')
export class MmBomsController {
  constructor(private readonly mmBomsService: MmBomsService) {}

  @Post(':manufacturedMaterialCode/append')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_MANUFACTURED_MATERIAL_BOM)
  @ApiBearerAuth()
  appendItem(
    @Param('manufacturedMaterialCode') manufacturedMaterialCode: string,
    @Body() createBomItemDto: CreateMmBomItemDto,
    @RequestUser() user: User,
  ) {
    return this.mmBomsService.appendItem(manufacturedMaterialCode, createBomItemDto, user);
  }

  @Get(':manufacturedMaterialCode')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MANUFACTURED_MATERIAL_BOMS)
  @ApiBearerAuth()
  get(@Param('manufacturedMaterialCode') manufacturedMaterialCode: string) {
    return this.mmBomsService.get(manufacturedMaterialCode);
  }

  @Patch(':itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_MANUFACTURED_MATERIAL_BOM)
  @ApiBearerAuth()
  updateItem(@Param('itemId', ParseUUIDPipe) itemId: string, @Body() updateBomItemDto: UpdateMmBomItemDto) {
    return this.mmBomsService.updateItem(itemId, updateBomItemDto);
  }
}
