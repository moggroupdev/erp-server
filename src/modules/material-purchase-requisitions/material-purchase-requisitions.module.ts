import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialPurchaseRequisitionsService } from './material-purchase-requisitions.service';
import { MaterialPurchaseRequisitionsController } from './material-purchase-requisitions.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialPurchaseRequisitionsController],
  providers: [MaterialPurchaseRequisitionsService, QueryBuilderService],
})
export class MaterialPurchaseRequisitionsModule {}
