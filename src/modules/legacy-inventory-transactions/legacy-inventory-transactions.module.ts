import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { LegacyInventoryTransactionsService } from './legacy-inventory-transactions.service';
import { LegacyInventoryTransactionsController } from './legacy-inventory-transactions.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LegacyInventoryTransactionsController],
  providers: [LegacyInventoryTransactionsService, QueryBuilderService],
})
export class LegacyInventoryTransactionsModule {}
