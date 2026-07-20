import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialsReportsController } from './materials/materials-reports.controller';
import { MaterialsReportsService } from './materials/materials-reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialsReportsController],
  providers: [MaterialsReportsService],
})
export class ReportsModule {}
