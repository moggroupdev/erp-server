import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from 'src/utils/constants';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { ProductionDepartmentManagersService } from './production-department-managers.service';
import { AssignProductionDepartmentManagerDto } from './dto/assign-production-department-manager.dto';

@Controller('production-department-managers')
export class ProductionDepartmentManagersController {
  constructor(private readonly productionDepartmentManagersService: ProductionDepartmentManagersService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_PRODUCTION_DEPARTMENT_MANAGERS)
  @ApiBearerAuth()
  list() {
    return this.productionDepartmentManagersService.list();
  }

  @Put(':department')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_PRODUCTION_DEPARTMENT_MANAGERS)
  @ApiBearerAuth()
  assign(@Param('department') department: string, @Body() dto: AssignProductionDepartmentManagerDto) {
    return this.productionDepartmentManagersService.assign(department, dto);
  }
}
