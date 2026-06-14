import { Injectable, Inject } from '@nestjs/common';
import { getTableColumns, SQL, and, or, asc, desc, count, eq, gt, gte, lt, lte, ne, ilike, inArray } from 'drizzle-orm';
import { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { Pagination, QueryParams } from '../types';

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

interface QueryBuilderOptions {
  filtering?: boolean;
  searchableFields?: string[];
  fieldLimiting?: boolean;
  pagination?: boolean;
  sorting?: boolean;

  withRelations?: RelationConfig;
}

@Injectable()
export class QueryBuilderService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  /**
   * Executes the built query with the specified options.
   *
   * @param table The Drizzle table schema.
   * @param queryParams The query parameters from the request.
   * @param options Configuration options for the query features.
   * @returns An object containing the query results, and optionally pagination metadata.
   */
  async execute<T extends Record<string, any>>(table: PgTable, queryParams: QueryParams, options: QueryBuilderOptions = {}) {
    const {
      filtering = false,
      searchableFields = [],
      fieldLimiting = false,
      pagination = false,
      sorting = false,
      withRelations,
    } = options;

    const tableColumns = getTableColumns(table);
    const conditions: SQL[] = [];

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

    return {
      results: data.length,
      data: data as Partial<T>[],
    };
  }

  // =============== Private Methods ===============

  /**
   * Executes query using Drizzle's relational query API for efficient joins
   */
  private async executeWithRelations<T extends Record<string, any>>(
    table: PgTable,
    queryParams: QueryParams,
    whereClause: SQL | undefined,
    options: QueryBuilderOptions,
  ) {
    const { pagination, sorting, withRelations } = options;
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
      with?: RelationConfig;
      orderBy?: SQL;
      limit?: number;
      offset?: number;
    }

    const queryOptions: QueryOptions = {
      where: whereClause,
      with: withRelations,
    };

    if (orderByClause) queryOptions.orderBy = orderByClause;

    if (pagination) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    // Use the query builder's findMany method
    type QueryBuilder = {
      [key: string]: { findMany: (options: QueryOptions) => Promise<unknown[]> };
    };

    const dbQuery = this.db.query as QueryBuilder;
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

    return {
      results: data.length,
      data: data as Partial<T>[],
    };
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
