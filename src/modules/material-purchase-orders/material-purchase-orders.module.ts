import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialPurchaseOrdersService } from './material-purchase-orders.service';
import { MaterialPurchaseOrdersController } from './material-purchase-orders.controller';
import { MaterialPurchaseReceiptsController } from './material-purchase-receipts.controller';
import { MaterialPurchaseRequisitionsService } from './material-purchase-requisitions.service';
import { MaterialPurchaseRequisitionsController } from './material-purchase-requisitions.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    MaterialPurchaseOrdersController,
    MaterialPurchaseReceiptsController,
    MaterialPurchaseRequisitionsController,
  ],
  providers: [MaterialPurchaseOrdersService, MaterialPurchaseRequisitionsService, QueryBuilderService],
})
export class MaterialPurchaseOrdersModule {}
