import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AccountingReportsController } from './accounting/accounting-reports.controller';
import { AccountingReportsService } from './accounting/accounting-reports.service';
import { MaterialsReportsController } from './materials/materials-reports.controller';
import { MaterialsReportsService } from './materials/materials-reports.service';
import { PurchasingMaterialsReportsController } from './purchasing-materials/purchasing-materials-reports.controller';
import { PurchasingMaterialsReportsService } from './purchasing-materials/purchasing-materials-reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialsReportsController, PurchasingMaterialsReportsController, AccountingReportsController],
  providers: [MaterialsReportsService, PurchasingMaterialsReportsService, AccountingReportsService],
})
export class ReportsModule {}
