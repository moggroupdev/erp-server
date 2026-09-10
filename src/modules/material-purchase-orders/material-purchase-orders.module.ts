import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialPurchaseOrdersService } from './material-purchase-orders.service';
import { MaterialPurchaseOrdersController } from './material-purchase-orders.controller';
import { MaterialPurchaseReceiptsService } from './material-purchase-receipts.service';
import { MaterialPurchaseReceiptsController } from './material-purchase-receipts.controller';
import { MaterialPurchaseRequisitionsService } from './material-purchase-requisitions.service';
import { MaterialPurchaseRequisitionsController } from './material-purchase-requisitions.controller';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { UploaderService } from 'src/utils/services/uploader.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    MaterialPurchaseOrdersController,
    MaterialPurchaseReceiptsController,
    MaterialPurchaseRequisitionsController,
    SupplierInvoicesController,
  ],
  providers: [
    MaterialPurchaseOrdersService,
    MaterialPurchaseReceiptsService,
    MaterialPurchaseRequisitionsService,
    SupplierInvoicesService,
    MaterialUnitValidationService,
    QueryBuilderService,
    UploaderService,
  ],
})
export class MaterialPurchaseOrdersModule {}
