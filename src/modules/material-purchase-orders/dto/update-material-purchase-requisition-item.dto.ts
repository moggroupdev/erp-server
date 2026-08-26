import { PartialType } from '@nestjs/swagger';
import { CreateMaterialPurchaseRequisitionItemDto } from './create-material-purchase-requisition-item.dto';

export class UpdateMaterialPurchaseRequisitionItemDto extends PartialType(CreateMaterialPurchaseRequisitionItemDto) {}
