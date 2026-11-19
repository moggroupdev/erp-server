import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { CustomersService } from './customers.service';
import { CustomerMergeService } from './customer-merge.service';
import { CustomersController } from './customers.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerMergeService, QueryBuilderService],
})
export class CustomersModule {}
