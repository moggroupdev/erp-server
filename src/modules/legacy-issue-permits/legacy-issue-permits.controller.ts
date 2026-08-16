import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { LegacyIssuePermitsService } from './legacy-issue-permits.service';
import { CreateLegacyIssuePermitDto } from './dto/create-legacy-issue-permit.dto';
import { CreateLegacyIssuePermitItemDto } from './dto/create-legacy-issue-permit-item.dto';
import { UpdateLegacyIssuePermitDto } from './dto/update-legacy-issue-permit.dto';
import { UpdateLegacyIssuePermitItemDto } from './dto/update-legacy-issue-permit-item.dto';
import { ReorderLegacyIssuePermitItemsDto } from './dto/reorder-legacy-issue-permit-items.dto';

@Controller('legacy-issue-permits')
export class LegacyIssuePermitsController {
  constructor(private readonly legacyIssuePermitsService: LegacyIssuePermitsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_ISSUE_PERMIT)
  @ApiBearerAuth()
  create(@Body() createDto: CreateLegacyIssuePermitDto, @RequestUser() user: User) {
    return this.legacyIssuePermitsService.create(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_LEGACY_ISSUE_PERMITS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.legacyIssuePermitsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_LEGACY_ISSUE_PERMITS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.legacyIssuePermitsService.get(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_ISSUE_PERMIT)
  @ApiBearerAuth()
  updateHeader(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateLegacyIssuePermitDto) {
    return this.legacyIssuePermitsService.updateHeader(id, updateDto);
  }

  @Post(':id/items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_ISSUE_PERMIT)
  @ApiBearerAuth()
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() createDto: CreateLegacyIssuePermitItemDto) {
    return this.legacyIssuePermitsService.addItem(id, createDto);
  }

  @Patch(':id/items-order')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_ISSUE_PERMIT)
  @ApiBearerAuth()
  reorderItems(@Param('id', ParseUUIDPipe) id: string, @Body() reorderDto: ReorderLegacyIssuePermitItemsDto) {
    return this.legacyIssuePermitsService.reorderItems(id, reorderDto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_ISSUE_PERMIT)
  @ApiBearerAuth()
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() updateDto: UpdateLegacyIssuePermitItemDto,
  ) {
    return this.legacyIssuePermitsService.updateItem(id, itemId, updateDto);
  }
}
