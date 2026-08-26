import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMaterialPurchaseRequisitionDto } from './create-material-purchase-requisition.dto';

export class UpdateMaterialPurchaseRequisitionDto extends PartialType(
  OmitType(CreateMaterialPurchaseRequisitionDto, ['items'] as const),
) {}
