import { Injectable, Inject } from '@nestjs/common';
import { getTableColumns, SQL, and, or, asc, desc, count, eq, gt, gte, lt, lte, ne, ilike, inArray } from 'drizzle-orm';
import { PgTable, PgColumn } from 'drizzle-orm/pg-core';
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

    // If relations are requested, use relational query API
    if (withRelations) {
      return this.executeWithRelations<T>(table, queryParams, whereClause, {
        filtering,
        searchableFields,
        fieldLimiting,
        pagination,
        sorting,
        withRelations,
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

    // 4. Sorting
    if (sorting) {
      const sortBy = (queryParams.sortBy as string) || '-createdAt';
      const isDesc = sortBy.startsWith('-');
      const fieldName = isDesc ? sortBy.slice(1) : sortBy;
      if (tableColumns[fieldName]) {
        query.orderBy(isDesc ? desc(tableColumns[fieldName]) : asc(tableColumns[fieldName]));
      } else if (tableColumns['createdAt']) {
        // Fallback or verify if default exists
        query.orderBy(desc(tableColumns['createdAt']));
      }
    }

    // 5. Pagination
    let page = 1;
    let limit = 10;
    if (pagination) {
      page = Number(queryParams.page) || 1;
      limit = Number(queryParams.limit) || 10;
      const offset = (page - 1) * limit;
      query.limit(limit).offset(offset);
    }

    // Execute query
    const data = await query;

    if (pagination) {
      const numericTotalRecords = Number(totalRecords);
      const totalPages = Math.ceil(numericTotalRecords / limit);
      const paginationData: Pagination = {
        page,
        limit,
        totalRecords: numericTotalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
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
    const { pagination, sorting, withRelations, columns } = options;
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

    // Build order by clause
    let orderByClause: SQL | undefined;
    if (sorting) {
      const sortBy = (queryParams.sortBy as string) || '-createdAt';
      const isDesc = sortBy.startsWith('-');
      const fieldName = isDesc ? sortBy.slice(1) : sortBy;
      if (tableColumns[fieldName]) {
        orderByClause = isDesc ? desc(tableColumns[fieldName]) : asc(tableColumns[fieldName]);
      } else if (tableColumns['createdAt']) {
        orderByClause = desc(tableColumns['createdAt']);
      }
    }

    // Pagination
    let page = 1;
    let limit = 10;
    let offset = 0;
    if (pagination) {
      page = Number(queryParams.page) || 1;
      limit = Number(queryParams.limit) || 10;
      offset = (page - 1) * limit;
    }

    // Execute relational query
    interface QueryOptions {
      where?: SQL;
      columns?: Record<string, boolean>;
      with?: RelationConfig;
      orderBy?: SQL;
      limit?: number;
      offset?: number;
    }

    const queryOptions: QueryOptions = {
      where: whereClause,
      with: withRelations,
    };

    if (columns) queryOptions.columns = columns;
    if (orderByClause) queryOptions.orderBy = orderByClause;

    if (pagination) {
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
      const totalPages = Math.ceil(numericTotalRecords / limit);
      const paginationData: Pagination = {
        page,
        limit,
        totalRecords: numericTotalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
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
