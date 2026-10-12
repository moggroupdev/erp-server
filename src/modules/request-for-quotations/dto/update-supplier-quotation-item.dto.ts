import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSupplierQuotationItemDto } from './create-supplier-quotation-item.dto';

export class UpdateSupplierQuotationItemDto extends PartialType(
  OmitType(CreateSupplierQuotationItemDto, ['requestForQuotationItemId'] as const),
) {}
