import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, QueryBuilderService],
})
export class AuditLogsModule {}
