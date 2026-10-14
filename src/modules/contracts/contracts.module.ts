import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContractsController],
  providers: [ContractsService, QueryBuilderService],
})
export class ContractsModule {}
