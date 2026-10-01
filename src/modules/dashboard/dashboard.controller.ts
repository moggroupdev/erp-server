import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { PERMISSIONS } from 'src/utils/constants';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('quick-stats')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.SHOW_ANALYTICS)
  @ApiBearerAuth()
  getQuickStats() {
    return this.dashboardService.getQuickStats();
  }
}
