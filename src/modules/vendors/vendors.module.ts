import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [VendorsController],
  providers: [VendorsService, QueryBuilderService],
})
export class VendorsModule {}
