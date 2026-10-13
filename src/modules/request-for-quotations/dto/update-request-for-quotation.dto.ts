import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRequestForQuotationDto } from './create-request-for-quotation.dto';

export class UpdateRequestForQuotationDto extends PartialType(
  OmitType(CreateRequestForQuotationDto, ['items'] as const),
) {}
