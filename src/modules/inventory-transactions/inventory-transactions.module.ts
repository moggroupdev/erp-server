import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryTransactionsService } from './inventory-transactions.service';
import { InventoryTransactionsController } from './inventory-transactions.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InventoryTransactionsController],
  providers: [InventoryTransactionsService, QueryBuilderService],
})
export class InventoryTransactionsModule {}
