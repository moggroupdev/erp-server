import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialPurchaseOrdersService } from './material-purchase-orders.service';
import { MaterialPurchaseOrdersController } from './material-purchase-orders.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialPurchaseOrdersController],
  providers: [MaterialPurchaseOrdersService, QueryBuilderService],
})
export class MaterialPurchaseOrdersModule {}
