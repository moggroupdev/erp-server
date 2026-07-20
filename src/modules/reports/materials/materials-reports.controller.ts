import { Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { PERMISSIONS } from 'src/utils/constants';
import { MaterialsReportsService } from './materials-reports.service';

@Controller('reports/materials')
export class MaterialsReportsController {
  constructor(private readonly materialsReportsService: MaterialsReportsService) {}

  @Get('inventory-summary')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_REPORTS)
  @ApiBearerAuth()
  getInventorySummary() {
    return this.materialsReportsService.getInventorySummary();
  }

  @Get('category-stats')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_REPORTS)
  @ApiBearerAuth()
  getCategoryStats(@Query('mainCategoryId', ParseUUIDPipe) mainCategoryId: string) {
    return this.materialsReportsService.getCategoryStats(mainCategoryId);
  }
}
