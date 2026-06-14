import { TOKEN_TYPE_VALUES } from './constants';

export type Pagination = {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type QueryParams = Record<string, string | string[] | undefined>;

export type TokenType = (typeof TOKEN_TYPE_VALUES)[number];
export type JwtPayload = { id: string; type: TokenType };
