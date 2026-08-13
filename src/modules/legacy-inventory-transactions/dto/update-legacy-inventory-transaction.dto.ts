import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLegacyInventoryTransactionDto } from './create-legacy-inventory-transaction.dto';

export class UpdateLegacyInventoryTransactionDto extends PartialType(
  OmitType(CreateLegacyInventoryTransactionDto, ['items'] as const),
) {}