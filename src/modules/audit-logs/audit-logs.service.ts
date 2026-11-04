import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { auditLogs } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

type AuditSnapshot = Record<string, unknown> | null;

type MaterialTimelineSource = 'material' | 'unit_conversion' | 'manufactured_bom';

type MaterialTimelineChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

type MaterialTimelineEvent = {
  id: string;
  createdAt: Date;
  action: 'insert' | 'update' | 'delete';
  source: MaterialTimelineSource;
  actorUserId: string | null;
  actorName: string | null;
  subject: string | null;
  changes: MaterialTimelineChange[];
};

/** Cached stock/cost columns — omit from material timeline (noise from inventory sync). */
const MATERIAL_CACHE_COLUMNS = new Set(['quantity', 'unit_price']);

/** Bookkeeping / identity columns — actor + time already cover who/when. */
const HIDDEN_COLUMNS_BY_TABLE: Record<string, Set<string>> = {
  materials: new Set([
    'code',
    'created_at',
    'created_by',
    'quantity',
    'unit_price',
    'market_unit_price_set_at',
    'market_unit_price_set_by',
    'market_manufacturing_cost_set_at',
    'market_manufacturing_cost_set_by',
  ]),
  material_unit_conversions: new Set(['id', 'created_at', 'created_by', 'material_code']),
  manufactured_material_boms: new Set(['id', 'created_at', 'created_by', 'manufactured_material_code']),
};

const VISIBLE_COLUMNS_BY_TABLE: Record<string, string[]> = {
  materials: [
    'title',
    'legacy_code',
    'description',
    'sub_category_id',
    'material_type',
    'unit_of_measurement',
    'opening_unit_price',
    'opening_quantity',
    'minimum_stock',
    'market_unit_price',
    'market_manufacturing_cost',
    'deleted_at',
  ],
  material_unit_conversions: ['unit', 'conversion_factor_to_base'],
  manufactured_material_boms: [
    'material_code',
    'quantity_required',
    'unit_of_measurement_selected',
    'notes',
  ],
};

const TABLE_TO_SOURCE: Record<string, MaterialTimelineSource> = {
  materials: 'material',
  material_unit_conversions: 'unit_conversion',
  manufactured_material_boms: 'manufactured_bom',
};

const CHILD_TABLES = ['material_unit_conversions', 'manufactured_material_boms'] as const;

const DEFAULT_TIMELINE_LIMIT = 20;

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

  /**
   * Readable change history for one material: the material row plus owned
   * unit conversions and manufactured BOM lines. Excludes cache-only stock
   * quantity / unit_price updates.
   */
  public async materialTimeline(code: string, query: { page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || DEFAULT_TIMELINE_LIMIT));
    const offset = (page - 1) * limit;

    const scope = or(
      and(eq(auditLogs.tableName, 'materials'), eq(auditLogs.recordId, code)),
      and(
        eq(auditLogs.parentTableName, 'materials'),
        eq(auditLogs.parentRecordId, code),
        inArray(auditLogs.tableName, [...CHILD_TABLES]),
      ),
    );

    // Drop material updates whose only diffs are cached quantity / unit_price.
    const notCacheOnlyUpdate = sql`NOT (
      ${auditLogs.tableName} = 'materials'
      AND ${auditLogs.action} = 'update'
      AND ${auditLogs.changedColumns} IS NOT NULL
      AND ${auditLogs.changedColumns} <@ ARRAY['quantity', 'unit_price']::text[]
    )`;

    const where = and(scope, notCacheOnlyUpdate);

    const [countRow] = await this.db.select({ total: count() }).from(auditLogs).where(where);
    const totalRecords = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

    const rows = await this.db
      .select({
        id: auditLogs.id,
        tableName: auditLogs.tableName,
        action: auditLogs.action,
        oldRow: auditLogs.oldRow,
        newRow: auditLogs.newRow,
        changedColumns: auditLogs.changedColumns,
        actorUserId: auditLogs.actorUserId,
        actorName: auditLogs.actorName,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit)
      .offset(offset);

    const data: MaterialTimelineEvent[] = rows.map((row) => this.toTimelineEvent(row));

    return {
      results: data.length,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: totalRecords === 0 ? 0 : totalPages,
        hasNextPage: page < totalPages && totalRecords > 0,
        hasPreviousPage: page > 1 && totalRecords > 0,
      },
      data,
    };
  }

  private toTimelineEvent(row: {
    id: string;
    tableName: string;
    action: 'insert' | 'update' | 'delete';
    oldRow: unknown;
    newRow: unknown;
    changedColumns: string[] | null;
    actorUserId: string | null;
    actorName: string | null;
    createdAt: Date;
  }): MaterialTimelineEvent {
    const source = TABLE_TO_SOURCE[row.tableName] ?? 'material';
    const oldRow = (row.oldRow ?? null) as AuditSnapshot;
    const newRow = (row.newRow ?? null) as AuditSnapshot;
    const snapshot = row.action === 'delete' ? oldRow : newRow;

    return {
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      source,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      subject: this.resolveSubject(row.tableName, snapshot),
      changes: this.buildChanges(row.tableName, row.action, oldRow, newRow, row.changedColumns),
    };
  }

  private resolveSubject(tableName: string, snapshot: AuditSnapshot): string | null {
    if (!snapshot) return null;
    if (tableName === 'material_unit_conversions') {
      const unit = snapshot.unit;
      return typeof unit === 'string' ? unit : unit != null ? String(unit) : null;
    }
    if (tableName === 'manufactured_material_boms') {
      const code = snapshot.material_code;
      return typeof code === 'string' ? code : code != null ? String(code) : null;
    }
    return null;
  }

  private buildChanges(
    tableName: string,
    action: 'insert' | 'update' | 'delete',
    oldRow: AuditSnapshot,
    newRow: AuditSnapshot,
    changedColumns: string[] | null,
  ): MaterialTimelineChange[] {
    const visible = VISIBLE_COLUMNS_BY_TABLE[tableName] ?? [];
    const hidden = HIDDEN_COLUMNS_BY_TABLE[tableName] ?? new Set<string>();

    let columns: string[];
    if (action === 'update') {
      columns = (changedColumns ?? []).filter((col) => visible.includes(col) && !hidden.has(col));
    } else {
      columns = visible.filter((col) => !hidden.has(col));
    }

    const changes: MaterialTimelineChange[] = [];
    for (const column of columns) {
      const oldValue = action === 'insert' ? null : this.snapshotValue(oldRow, column);
      const newValue = action === 'delete' ? null : this.snapshotValue(newRow, column);

      if (action === 'insert' || action === 'delete') {
        const value = action === 'insert' ? newValue : oldValue;
        if (value === null || value === undefined || value === '') continue;
      } else if (this.valuesEqual(oldValue, newValue)) {
        continue;
      }

      // Skip cache columns even if they somehow appear alongside real edits
      if (tableName === 'materials' && MATERIAL_CACHE_COLUMNS.has(column)) continue;

      changes.push({
        field: snakeToCamel(column),
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
      });
    }

    return changes;
  }

  private snapshotValue(row: AuditSnapshot, column: string): unknown {
    if (!row) return null;
    return row[column] ?? null;
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
