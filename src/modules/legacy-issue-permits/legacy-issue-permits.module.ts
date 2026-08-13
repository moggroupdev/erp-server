import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { LegacyIssuePermitsService } from './legacy-issue-permits.service';
import { LegacyIssuePermitsController } from './legacy-issue-permits.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LegacyIssuePermitsController],
  providers: [LegacyIssuePermitsService, QueryBuilderService],
})
export class LegacyIssuePermitsModule {}
