import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { UploaderService } from 'src/utils/services/uploader.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, UploaderService],
})
export class DepartmentsModule {}
