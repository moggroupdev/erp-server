import { OmitType } from '@nestjs/swagger';
import { CreateSupplierInvoiceDto } from './create-supplier-invoice.dto';

export class UpdateSupplierInvoiceFromPdfDto extends OmitType(CreateSupplierInvoiceDto, [
  'materialPurchaseOrderId',
] as const) {}
