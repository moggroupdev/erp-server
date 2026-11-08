import { Injectable, Inject } from '@nestjs/common';
import {
  getTableColumns,
  SQL,
  sql,
  and,
  or,
  asc,
  desc,
  count,
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  ilike,
  inArray,
  type SQLWrapper,
} from 'drizzle-orm';
import { PgTable, PgColumn, getTableConfig } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { PaginatedData, Pagination, QueryParams } from '../types';

const OPERATORS_MAP = { gt, gte, lt, lte, ne } as const;
const RESERVED_KEYS = ['keyword', 'fields', 'sortBy', 'page', 'limit'];

interface RelationConfig {
  [relationName: string]:
    | boolean
    | {
        where?: SQL;
        columns?: Record<string, boolean>;
      };
}

interface JoinFilterConfig {
  /** Column on the base table that holds the FK into `relatedTable` (e.g. materials.subCategoryId). */
  localColumn: PgColumn;
  /** Column on `relatedTable` matched against `localColumn` (usually its primary key, e.g. materialCategorySubs.id). */
  relatedIdColumn: PgColumn;
  /** The related table to query. */
  relatedTable: PgTable;
  /** Column on `relatedTable` compared against the incoming query param value (e.g. materialCategorySubs.mainCategoryId). */
  relatedFilterColumn: PgColumn;
}

interface QueryBuilderOptionsBase {
  filtering?: boolean;
  searchableFields?: string[];
  fieldLimiting?: boolean;
  sorting?: boolean;
  additionalConditions?: SQL[];
  withRelations?: RelationConfig;
  extras?: (fields: Record<string, SQLWrapper>, operators: { sql: typeof sql }) => Record<string, unknown>;
  /** Virtual filter keys resolved via subquery on a related table (e.g. filter materials by mainCategoryId). */
  joinFilters?: Record<string, JoinFilterConfig>;
  /** Drizzle column selection (e.g. `{ password: false }`) — works for both plain and relational queries. */
  columns?: Record<string, boolean>;
}

type QueryBuilderOptions = QueryBuilderOptionsBase & ({ pagination?: false } | { pagination: true });

@Injectable()
export class QueryBuilderService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  /**
   * Executes the built query with the specified options.
   *
   * @param table The Drizzle table schema.
   * @param queryParams The query parameters from the request.
   * @param options Configuration options for the query features.
   * @returns An array when pagination is disabled, or pagination metadata with data when enabled.
   */
  async execute<T extends Record<string, any>>(
    table: PgTable,
    queryParams: QueryParams,
    options: QueryBuilderOptionsBase & { pagination: true },
  ): Promise<PaginatedData<T>>;
  async execute<T extends Record<string, any>>(
    table: PgTable,
    queryParams: QueryParams,
    options?: QueryBuilderOptionsBase & { pagination?: false },
  ): Promise<Partial<T>[]>;
  async execute<T extends Record<string, any>>(table: PgTable, queryParams: QueryParams, options: QueryBuilderOptions = {}) {
    const {
      filtering = false,
      searchableFields = [],
      fieldLimiting = false,
      pagination = false,
      sorting = false,
      withRelations,
      extras,
      joinFilters,
      columns,
    } = options;

    const tableColumns = getTableColumns(table);
    const conditions: SQL[] = [...(options.additionalConditions ?? [])];

    // 1. Filtering
    if (filtering) {
      const OPERATOR_REGEX = /^(.+)\[(gt|gte|lt|lte|ne)]$/;

      for (const [rawKey, rawValue] of Object.entries(queryParams)) {
        if (RESERVED_KEYS.includes(rawKey)) continue;
        if (rawValue === undefined) continue;

        let fieldName = rawKey;
        let operator: keyof typeof OPERATORS_MAP | null = null;

        const match = rawKey.match(OPERATOR_REGEX);
        if (match) {
          fieldName = match[1];
          operator = match[2] as keyof typeof OPERATORS_MAP;
        }

        // Join filters (virtual keys resolved via subquery on a related table)
        const joinFilter = joinFilters?.[fieldName];
        if (joinFilter && !operator) {
          const { localColumn, relatedIdColumn, relatedTable, relatedFilterColumn } = joinFilter;
          const filterCondition = Array.isArray(rawValue)
            ? inArray(
                relatedFilterColumn,
                rawValue.map((v) => parseValue(relatedFilterColumn, v)),
              )
            : eq(relatedFilterColumn, parseValue(relatedFilterColumn, rawValue));

          conditions.push(
            inArray(localColumn, this.db.select({ id: relatedIdColumn }).from(relatedTable).where(filterCondition)),
          );
          continue;
        }

        const column = tableColumns[fieldName];
        if (!column) continue;

        // operator-based (gt, gte, ...)
        if (operator) {
          conditions.push(OPERATORS_MAP[operator](column, parseValue(column, rawValue)));
          continue;
        }

        // IN (...)
        if (Array.isArray(rawValue)) {
          conditions.push(
            inArray(
              column,
              rawValue.map((v) => parseValue(column, v)),
            ),
          );
          continue;
        }

        // equality
        conditions.push(eq(column, parseValue(column, rawValue)));
      }
    }

    // 2. Searching
    if (queryParams.keyword && searchableFields.length > 0) {
      const keyword = queryParams.keyword as string;
      const searchConditions = searchableFields
        .filter((field) => tableColumns[field])
        .map((field) => ilike(tableColumns[field], `%${keyword}%`));
      if (searchConditions.length > 0) conditions.push(or(...searchConditions)!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // If relations or extras are requested, use relational query API
    if (withRelations || extras) {
      return this.executeWithRelations<T>(table, queryParams, whereClause, {
        filtering,
        searchableFields,
        fieldLimiting,
        pagination,
        sorting,
        withRelations,
        extras,
        columns,
      });
    }

    // Get Total Count (for pagination)
    let totalRecords = 0;
    if (pagination) {
      const countResult = await this.db.select({ count: count() }).from(table).where(whereClause);
      totalRecords = Number(countResult[0]?.count ?? 0);
    }

    // 3. Field Limiting
    let selectFields: Record<string, PgColumn> | undefined;
    if (fieldLimiting && queryParams.fields) {
      const fields = (queryParams.fields as string).split(',');
      const selectedColumns: Record<string, PgColumn> = {};
      let hasValidField = false;
      fields.forEach((field) => {
        if (tableColumns[field.trim()]) {
          selectedColumns[field.trim()] = tableColumns[field.trim()];
          hasValidField = true;
        }
      });
      if (hasValidField) selectFields = selectedColumns;
    }

    // Apply column include/exclude (e.g. `{ password: false }`)
    if (columns) {
      selectFields = this.applyColumns(tableColumns, columns, selectFields);
    }

    // Build Main Query
    const query = selectFields ? this.db.select(selectFields).from(table) : this.db.select().from(table);

    // Apply where clause
    if (whereClause) query.where(whereClause);

    // 4. Sorting (primary-key tie-breaker keeps LIMIT/OFFSET pages stable when sort values collide)
    if (sorting) {
      const sorts = buildStableOrderBy(table, tableColumns, queryParams.sortBy as string | undefined);
      if (sorts.length > 0) query.orderBy(...sorts);
    }

    // 5. Pagination
    let page = 1;
    let limit = 10;
    let isUnlimited = false;
    if (pagination) {
      page = Number(queryParams.page) || 1;
      isUnlimited = String(queryParams.limit).toLowerCase() === 'infinity';
      limit = isUnlimited ? 0 : Number(queryParams.limit) || 10;
      if (!isUnlimited) {
        const offset = (page - 1) * limit;
        query.limit(limit).offset(offset);
      }
    }

    // Execute query
    const data = await query;

    if (pagination) {
      const numericTotalRecords = Number(totalRecords);
      const totalPages = isUnlimited ? 1 : Math.ceil(numericTotalRecords / limit);
      const paginationData: Pagination = {
        page: isUnlimited ? 1 : page,
        limit: isUnlimited ? numericTotalRecords : limit,
        totalRecords: numericTotalRecords,
        totalPages,
        hasNextPage: isUnlimited ? false : page < totalPages,
        hasPreviousPage: isUnlimited ? false : page > 1,
      };

      return {
        results: data.length,
        pagination: paginationData,
        data: data as Partial<T>[],
      };
    }

    return data as Partial<T>[];
  }

  // =============== Private Methods ===============

  /**
   * Executes query using Drizzle's relational query API for efficient joins
   */
  private async executeWithRelations<T extends Record<string, any>>(
    table: PgTable,
    queryParams: QueryParams,
    whereClause: SQL | undefined,
    options: QueryBuilderOptionsBase & { pagination?: boolean },
  ): Promise<Partial<T>[] | PaginatedData<T>> {
    const { pagination, sorting, withRelations, extras, columns } = options;
    const tableColumns = getTableColumns(table);

    // Get table name from the table object
    const tableWithSymbol = table as unknown as { [key: symbol]: string };
    const tableWithUnderscore = table as unknown as { _: { name: string } };
    const tableName: string = tableWithSymbol[Symbol.for('drizzle:Name')] || tableWithUnderscore._.name;

    // Get Total Count (for pagination)
    let totalRecords = 0;
    if (pagination) {
      const countResult = await this.db.select({ count: count() }).from(table).where(whereClause);
      totalRecords = Number(countResult[0]?.count ?? 0);
    }

    // Build order by clause (primary-key tie-breaker; findMany accepts an array)
    const orderByClause = sorting
      ? buildStableOrderBy(table, tableColumns, queryParams.sortBy as string | undefined)
      : [];

    // Pagination
    let page = 1;
    let limit = 10;
    let offset = 0;
    let isUnlimited = false;
    if (pagination) {
      page = Number(queryParams.page) || 1;
      isUnlimited = String(queryParams.limit).toLowerCase() === 'infinity';
      limit = isUnlimited ? 0 : Number(queryParams.limit) || 10;
      offset = isUnlimited ? 0 : (page - 1) * limit;
    }

    // Execute relational query
    interface QueryOptions {
      where?: SQL;
      columns?: Record<string, boolean>;
      with?: RelationConfig;
      extras?: QueryBuilderOptionsBase['extras'];
      orderBy?: SQL | SQL[];
      limit?: number;
      offset?: number;
    }

    const queryOptions: QueryOptions = {
      where: whereClause,
    };

    if (withRelations) queryOptions.with = withRelations;
    if (extras) queryOptions.extras = extras;
    if (columns) queryOptions.columns = columns;
    if (orderByClause.length > 0) queryOptions.orderBy = orderByClause;

    if (pagination && !isUnlimited) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    // Use the query builder's findMany method
    type QueryBuilder = {
      [key: string]: { findMany: (options: QueryOptions) => Promise<unknown[]> };
    };

    const dbQuery = this.db.query as unknown as QueryBuilder;
    let queryBuilderTable = dbQuery[tableName];

    // If table not found directly, try converting snake_case to camelCase (e.g., fixed_assets -> fixedAssets)
    if (!queryBuilderTable) {
      const camelCaseName = tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      queryBuilderTable = dbQuery[camelCaseName];
    }

    if (!queryBuilderTable)
      throw new Error(
        `QueryBuilderService: Could not find table '${tableName}' in db.query. Make sure the table is exported in the schema.`,
      );

    const data = await queryBuilderTable.findMany(queryOptions);

    if (pagination) {
      const numericTotalRecords = Number(totalRecords);
      const totalPages = isUnlimited ? 1 : Math.ceil(numericTotalRecords / limit);
      const paginationData: Pagination = {
        page: isUnlimited ? 1 : page,
        limit: isUnlimited ? numericTotalRecords : limit,
        totalRecords: numericTotalRecords,
        totalPages,
        hasNextPage: isUnlimited ? false : page < totalPages,
        hasPreviousPage: isUnlimited ? false : page > 1,
      };

      return {
        results: data.length,
        pagination: paginationData,
        data: data as Partial<T>[],
      };
    }

    return data as Partial<T>[];
  }

  /**
   * Finds the previous and next rows for `currentId` in the same keyword + stable sort
   * order used by paginated `execute` (primary sort, then primary-key ascending).
   *
   * Returns null neighbors when the current row is missing from the filtered set.
   */
  async findNeighbors<T extends Record<string, any>>(
    table: PgTable,
    currentId: string,
    queryParams: Pick<QueryParams, 'keyword' | 'sortBy'>,
    options: {
      searchableFields?: string[];
      /** Columns to return for each neighbor (must include the id column). */
      select?: Record<string, PgColumn>;
      idField?: string;
    } = {},
  ): Promise<{ previous: Partial<T> | null; next: Partial<T> | null }> {
    const { searchableFields = [], select, idField = 'id' } = options;
    const tableColumns = getTableColumns(table);
    const idColumn = tableColumns[idField];
    if (!idColumn) throw new Error(`QueryBuilderService.findNeighbors: unknown id field '${idField}'.`);

    const [currentRow] = await this.db.select().from(table).where(eq(idColumn, currentId)).limit(1);
    if (!currentRow) {
      return { previous: null, next: null };
    }

    const conditions: SQL[] = [];
    if (queryParams.keyword && searchableFields.length > 0) {
      const keyword = queryParams.keyword as string;
      const searchConditions = searchableFields
        .filter((field) => tableColumns[field])
        .map((field) => ilike(tableColumns[field], `%${keyword}%`));
      if (searchConditions.length > 0) conditions.push(or(...searchConditions)!);
    }

    const filterWhere = conditions.length > 0 ? and(...conditions) : undefined;

    // Current row must match the same keyword filter as the list.
    if (filterWhere) {
      const [inFilter] = await this.db
        .select({ id: idColumn })
        .from(table)
        .where(and(eq(idColumn, currentId), filterWhere))
        .limit(1);
      if (!inFilter) {
        return { previous: null, next: null };
      }
    }

    const resolved = resolveStableSort(table, tableColumns, queryParams.sortBy as string | undefined);
    if (!resolved) {
      return { previous: null, next: null };
    }

    const { primarySortColumn, primarySortDesc, tieBreakers } = resolved;
    const primarySortKey = columnJsKey(tableColumns, primarySortColumn);
    const currentSortValue = (currentRow as Record<string, unknown>)[primarySortKey];
    const currentTieValues = tieBreakers.map((col) => {
      const key = columnJsKey(tableColumns, col);
      return (currentRow as Record<string, unknown>)[key];
    });

    const selectFields = select ?? { [idField]: idColumn };
    const forwardOrder = buildStableOrderBy(table, tableColumns, queryParams.sortBy as string | undefined);
    const reverseOrder = reverseOrderBy(forwardOrder, primarySortColumn, primarySortDesc, tieBreakers);

    const nextCondition = buildAdjacentCondition(
      primarySortColumn,
      primarySortDesc,
      tieBreakers,
      currentSortValue,
      currentTieValues,
      'next',
    );
    const previousCondition = buildAdjacentCondition(
      primarySortColumn,
      primarySortDesc,
      tieBreakers,
      currentSortValue,
      currentTieValues,
      'previous',
    );

    const nextWhere = filterWhere ? and(filterWhere, nextCondition) : nextCondition;
    const previousWhere = filterWhere ? and(filterWhere, previousCondition) : previousCondition;

    const nextQuery = this.db.select(selectFields).from(table).where(nextWhere!);
    if (forwardOrder.length > 0) nextQuery.orderBy(...forwardOrder);
    nextQuery.limit(1);

    const previousQuery = this.db.select(selectFields).from(table).where(previousWhere!);
    if (reverseOrder.length > 0) previousQuery.orderBy(...reverseOrder);
    previousQuery.limit(1);

    const [nextRows, previousRows] = await Promise.all([nextQuery, previousQuery]);

    return {
      previous: (previousRows[0] as Partial<T> | undefined) ?? null,
      next: (nextRows[0] as Partial<T> | undefined) ?? null,
    };
  }

  /**
   * Maps Drizzle-style `columns` (`{ password: false }` exclusion or `{ id: true }` inclusion)
   * onto a SQL select shape for the non-relational query path.
   */
  private applyColumns(
    tableColumns: Record<string, PgColumn>,
    columns: Record<string, boolean>,
    existingSelect?: Record<string, PgColumn>,
  ): Record<string, PgColumn> {
    const entries = Object.entries(columns);
    const isExclusion = entries.length > 0 && entries.every(([, include]) => include === false);

    if (isExclusion) {
      const selected = { ...(existingSelect ?? tableColumns) };
      for (const [key] of entries) delete selected[key];
      return selected;
    }

    const selected: Record<string, PgColumn> = {};
    for (const [key, include] of entries) {
      if (!include) continue;
      const column = (existingSelect ?? tableColumns)[key] ?? tableColumns[key];
      if (column) selected[key] = column;
    }
    return selected;
  }
}

function parseValue(column: PgColumn, value: unknown): number | boolean | Date | string {
  switch (column.dataType) {
    case 'number':
      if (typeof value === 'number') return value;
      return Number(value);

    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 'true';

    case 'date':
      if (value instanceof Date) return value;
      return new Date(String(value));

    default:
      return String(value);
  }
}

type ResolvedStableSort = {
  primarySortColumn: PgColumn;
  primarySortDesc: boolean;
  tieBreakers: PgColumn[];
};

function resolveStableSort(
  table: PgTable,
  tableColumns: Record<string, PgColumn>,
  sortByParam: string | undefined,
): ResolvedStableSort | null {
  const sortBy = sortByParam || '-createdAt';
  const isDesc = sortBy.startsWith('-');
  const fieldName = isDesc ? sortBy.slice(1) : sortBy;

  let primarySortColumn: PgColumn | undefined;
  let primarySortDesc = false;

  if (tableColumns[fieldName]) {
    primarySortColumn = tableColumns[fieldName];
    primarySortDesc = isDesc;
  } else if (tableColumns['createdAt']) {
    primarySortColumn = tableColumns['createdAt'];
    primarySortDesc = true;
  }

  if (!primarySortColumn) return null;

  const usedNames = new Set<string>([primarySortColumn.name]);
  const pkColumns: PgColumn[] = [];
  for (const column of Object.values(tableColumns)) {
    if ((column as PgColumn & { primary?: boolean }).primary) pkColumns.push(column);
  }
  for (const primaryKey of getTableConfig(table).primaryKeys) {
    for (const column of primaryKey.columns) {
      if (!pkColumns.some((existing) => existing.name === column.name)) {
        pkColumns.push(column as PgColumn);
      }
    }
  }

  const tieBreakers: PgColumn[] = [];
  for (const pkColumn of pkColumns) {
    if (usedNames.has(pkColumn.name)) continue;
    usedNames.add(pkColumn.name);
    tieBreakers.push(pkColumn);
  }

  return { primarySortColumn, primarySortDesc, tieBreakers };
}

/**
 * Builds a total order for pagination: requested sort column, then primary-key columns
 * ascending so rows that share the same sort value never swap across LIMIT/OFFSET pages.
 *
 * Inline `.primaryKey()` columns expose `column.primary`; composite keys live in
 * `getTableConfig(table).primaryKeys`.
 */
function buildStableOrderBy(
  table: PgTable,
  tableColumns: Record<string, PgColumn>,
  sortByParam: string | undefined,
): SQL[] {
  const resolved = resolveStableSort(table, tableColumns, sortByParam);
  if (!resolved) return [];

  const { primarySortColumn, primarySortDesc, tieBreakers } = resolved;
  const sorts: SQL[] = [primarySortDesc ? desc(primarySortColumn) : asc(primarySortColumn)];
  for (const pkColumn of tieBreakers) {
    sorts.push(asc(pkColumn));
  }
  return sorts;
}

function columnJsKey(tableColumns: Record<string, PgColumn>, column: PgColumn): string {
  const match = Object.entries(tableColumns).find(([, col]) => col === column || col.name === column.name);
  if (!match) throw new Error(`QueryBuilderService: could not resolve JS key for column '${column.name}'.`);
  return match[0];
}

/**
 * Lexicographic neighbor of (primarySort, tieBreakers…) matching list order.
 * Tie-breakers are always ascending, same as `buildStableOrderBy`.
 */
function buildAdjacentCondition(
  primarySortColumn: PgColumn,
  primarySortDesc: boolean,
  tieBreakers: PgColumn[],
  currentSortValue: unknown,
  currentTieValues: unknown[],
  direction: 'previous' | 'next',
): SQL {
  const wantLater = direction === 'next';
  const primaryCmp = wantLater
    ? primarySortDesc
      ? lt(primarySortColumn, currentSortValue as string | number | Date)
      : gt(primarySortColumn, currentSortValue as string | number | Date)
    : primarySortDesc
      ? gt(primarySortColumn, currentSortValue as string | number | Date)
      : lt(primarySortColumn, currentSortValue as string | number | Date);

  if (tieBreakers.length === 0) {
    return primaryCmp;
  }

  const branches: SQL[] = [primaryCmp];

  for (let i = 0; i < tieBreakers.length; i++) {
    const equalPrefix: SQL[] = [eq(primarySortColumn, currentSortValue as string | number | Date)];
    for (let j = 0; j < i; j++) {
      equalPrefix.push(eq(tieBreakers[j], currentTieValues[j] as string | number | Date));
    }
    const tieCol = tieBreakers[i];
    const tieVal = currentTieValues[i] as string | number | Date;
    const tieCmp = wantLater ? gt(tieCol, tieVal) : lt(tieCol, tieVal);
    branches.push(and(...equalPrefix, tieCmp)!);
  }

  return or(...branches)!;
}

function reverseOrderBy(
  forwardOrder: SQL[],
  primarySortColumn: PgColumn,
  primarySortDesc: boolean,
  tieBreakers: PgColumn[],
): SQL[] {
  if (forwardOrder.length === 0) return [];
  const reversed: SQL[] = [primarySortDesc ? asc(primarySortColumn) : desc(primarySortColumn)];
  for (const pkColumn of tieBreakers) {
    reversed.push(desc(pkColumn));
  }
  return reversed;
}
