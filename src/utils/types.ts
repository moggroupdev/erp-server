import {
  DIMENSION_UNIT_VALUES,
  INVENTORY_TRANSACTION_TYPE_VALUES,
  LOGIN_STATUS_VALUES,
  MATERIAL_TYPE_VALUES,
  MATERIAL_UNIT_VALUES,
  OFFER_STATUS_VALUES,
  PRODUCT_SOURCE_TYPE_VALUES,
  TOKEN_TYPE_VALUES,
  VENDOR_QUOTATION_EMAIL_STATUS_VALUES,
  INQUIRY_STATUS_VALUES,
  PERMISSION_VALUES,
} from './constants';
import { departments, users, roles, vendors, customers } from 'src/database/schema';

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

// ==================== ENUMS ====================

export type Permission = (typeof PERMISSION_VALUES)[number];

export type LoginStatus = (typeof LOGIN_STATUS_VALUES)[number];

export type MaterialUnit = (typeof MATERIAL_UNIT_VALUES)[number];

export type DimensionUnit = (typeof DIMENSION_UNIT_VALUES)[number];

export type MaterialType = (typeof MATERIAL_TYPE_VALUES)[number];

export type ProductSourceType = (typeof PRODUCT_SOURCE_TYPE_VALUES)[number];

export type InquiryStatus = (typeof INQUIRY_STATUS_VALUES)[number];

export type OfferStatus = (typeof OFFER_STATUS_VALUES)[number];

export type VendorQuotationEmailStatus = (typeof VENDOR_QUOTATION_EMAIL_STATUS_VALUES)[number];

export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPE_VALUES)[number];

// ==================== ENTITIES ====================

export type Department = typeof departments.$inferSelect;

export type User = typeof users.$inferSelect;

export type Role = typeof roles.$inferSelect;

export type RoleWithPermissions = Role & { permissions: Permission[] };

/** User with their role and the role's permissions joined in. */
export type UserWithRoleWithPermissions = User & { role: RoleWithPermissions | null };

export type Vendor = typeof vendors.$inferSelect;

export type Customer = typeof customers.$inferSelect;
