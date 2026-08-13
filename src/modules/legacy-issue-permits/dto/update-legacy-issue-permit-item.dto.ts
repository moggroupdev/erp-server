import { PartialType } from '@nestjs/swagger';
import { CreateLegacyIssuePermitItemDto } from './create-legacy-issue-permit-item.dto';

export class UpdateLegacyIssuePermitItemDto extends PartialType(CreateLegacyIssuePermitItemDto) {}