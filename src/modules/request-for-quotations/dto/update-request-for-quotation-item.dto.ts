import { PartialType } from '@nestjs/swagger';
import { CreateRequestForQuotationItemDto } from './create-request-for-quotation-item.dto';

export class UpdateRequestForQuotationItemDto extends PartialType(CreateRequestForQuotationItemDto) {}
