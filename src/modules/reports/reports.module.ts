import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialsReportsController } from './materials/materials-reports.controller';
import { MaterialsReportsService } from './materials/materials-reports.service';
import { PurchasingMaterialsReportsController } from './purchasing-materials/purchasing-materials-reports.controller';
import { PurchasingMaterialsReportsService } from './purchasing-materials/purchasing-materials-reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialsReportsController, PurchasingMaterialsReportsController],
  providers: [MaterialsReportsService, PurchasingMaterialsReportsService],
})
export class ReportsModule {}
