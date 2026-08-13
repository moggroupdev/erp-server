import { PartialType } from '@nestjs/swagger';
import { CreateLegacyInventoryTransactionItemDto } from './create-legacy-inventory-transaction-item.dto';

export class UpdateLegacyInventoryTransactionItemDto extends PartialType(CreateLegacyInventoryTransactionItemDto) {}