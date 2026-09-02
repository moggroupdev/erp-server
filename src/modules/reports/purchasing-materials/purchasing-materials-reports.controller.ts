import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { PERMISSIONS } from 'src/utils/constants';
import { PurchasingMaterialsReportsService } from './purchasing-materials-reports.service';

@Controller('reports/purchasing-materials')
export class PurchasingMaterialsReportsController {
  constructor(private readonly service: PurchasingMaterialsReportsService) {}

  @Get('spending-summary')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getSpendingSummary(@Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy?: string) {
    return this.service.getSpendingSummary({ from, to, groupBy });
  }

  @Get('price-history')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getPriceHistory(@Query('materialCode') materialCode: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getPriceHistory({ materialCode, from, to });
  }

  @Get('category-stats')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getCategoryStats(
    @Query('mainCategoryId') mainCategoryId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getCategoryStats({ mainCategoryId, from, to });
  }

  @Get('subcategory-stats')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getSubCategoryStats(
    @Query('subCategoryId') subCategoryId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getSubCategoryStats({ subCategoryId, from, to });
  }

  @Get('supplier-stats')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getSupplierStats(
    @Query('supplierId') supplierId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.service.getSupplierStats({ supplierId, from, to, groupBy });
  }

  @Get('total-amount-mismatches')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_MATERIAL_PURCHASING_REPORTS)
  @ApiBearerAuth()
  getTotalAmountMismatches(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getTotalAmountMismatches({ from, to });
  }
}
