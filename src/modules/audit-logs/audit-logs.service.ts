import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { auditLogs } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(auditLogs, queryParams, {
      filtering: true,
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      // List omits full snapshots — use get() for forensic reconstruction
      columns: { oldRow: false, newRow: false },
    });
  }

  public async get(id: string) {
    const row = await this.db.query.auditLogs.findFirst({
      where: eq(auditLogs.id, id),
      with: {
        actorUser: { columns: { id: true, name: true } },
      },
    });

    if (!row)
      throw new NotFoundException(
        translate(`Audit log with ID ${id} does not exist.`, `لا يوجد سجل تدقيق بالمعرف ${id}.`),
      );

    return row;
  }
}
