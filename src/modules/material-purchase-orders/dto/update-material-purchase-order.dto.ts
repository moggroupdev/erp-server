import { OmitType } from '@nestjs/swagger';
import { CreateMaterialPurchaseOrderDto } from './create-material-purchase-order.dto';

export class UpdateMaterialPurchaseOrderDto extends OmitType(CreateMaterialPurchaseOrderDto, ['supplierId'] as const) {}
