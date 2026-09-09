import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { ProductionDepartmentManagersService } from './production-department-managers.service';
import { ProductionDepartmentManagersController } from './production-department-managers.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductionDepartmentManagersController],
  providers: [ProductionDepartmentManagersService],
})
export class ProductionDepartmentManagersModule {}
