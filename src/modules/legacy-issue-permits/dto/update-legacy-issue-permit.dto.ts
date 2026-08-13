import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLegacyIssuePermitDto } from './create-legacy-issue-permit.dto';

export class UpdateLegacyIssuePermitDto extends PartialType(
  OmitType(CreateLegacyIssuePermitDto, ['items'] as const),
) {}