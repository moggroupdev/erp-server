import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { PERMISSIONS } from 'src/utils/constants';
import { AccountingReportsService } from './accounting-reports.service';

@Controller('reports/accounting')
export class AccountingReportsController {
  constructor(private readonly service: AccountingReportsService) {}

  @Get('supplier-invoices')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_ACCOUNTING_SUPPLIER_INVOICES_REPORT)
  @ApiBearerAuth()
  getSupplierInvoices(
    @Query('supplierId') supplierId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.service.getSupplierInvoices({ supplierId, from, to, groupBy });
  }
}
