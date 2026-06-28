export const REQUEST_USER_KEY = 'user';
export const ALLOWED_PERMISSION_KEY = 'allowedPermission';

export const TOKEN_TYPE_VALUES = ['access', 'refresh'] as const;
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Seeded Production root department — see locations/departments.csv */
export const PRODUCTION_DEPARTMENT_ID = '3f2a91bc-4d8e-4a1f-b563-7c94e21a0b01';

// ==================== PERMISSIONS ====================

export const PERMISSION_VALUES = [
  'add_user',
  'list_users',
  'update_user',
  'delete_user',
  'add_role',
  'list_roles',
  'update_role',
  'delete_role',
] as const;

export const PERMISSIONS = Object.fromEntries(
  PERMISSION_VALUES.map((permission) => [permission.toUpperCase(), permission]),
) as {
  [K in Uppercase<(typeof PERMISSION_VALUES)[number]>]: Lowercase<K>;
};

// ==================== LOGIN_STATUSES ====================

export const LOGIN_STATUS_VALUES = ['success', 'failed'] as const;

export const LOGIN_STATUSES = Object.fromEntries(LOGIN_STATUS_VALUES.map((status) => [status.toUpperCase(), status])) as {
  [K in Uppercase<(typeof LOGIN_STATUS_VALUES)[number]>]: Lowercase<K>;
};

// ==================== MATERIAL_UNITS ====================

export const MATERIAL_UNIT_VALUES = ['count', 'kg', 'gram', 'meter', 'cm', 'liter', 'sheet', 'roll', 'box'] as const;

export const MATERIAL_UNITS = Object.fromEntries(
  MATERIAL_UNIT_VALUES.map((materialUnit) => [materialUnit.toUpperCase(), materialUnit]),
) as {
  [K in Uppercase<(typeof MATERIAL_UNIT_VALUES)[number]>]: Lowercase<K>;
};

// ==================== DIMENSION_UNITS ====================

export const DIMENSION_UNIT_VALUES = ['m', 'cm', 'mm'] as const;

export const DIMENSION_UNITS = Object.fromEntries(DIMENSION_UNIT_VALUES.map((unit) => [unit.toUpperCase(), unit])) as {
  [K in Uppercase<(typeof DIMENSION_UNIT_VALUES)[number]>]: Lowercase<K>;
};

// ==================== MATERIAL_TYPES ====================

export const MATERIAL_TYPE_VALUES = ['raw_materials', 'spare_parts'] as const;

export const MATERIAL_TYPES = Object.fromEntries(
  MATERIAL_TYPE_VALUES.map((materialType) => [materialType.toUpperCase(), materialType]),
) as {
  [K in Uppercase<(typeof MATERIAL_TYPE_VALUES)[number]>]: Lowercase<K>;
};

// ==================== PRODUCT_SOURCE_TYPES ====================

export const PRODUCT_SOURCE_TYPE_VALUES = ['manufactured', 'imported'] as const;

export const PRODUCT_SOURCE_TYPES = Object.fromEntries(
  PRODUCT_SOURCE_TYPE_VALUES.map((sourceType) => [sourceType.toUpperCase(), sourceType]),
) as {
  [K in Uppercase<(typeof PRODUCT_SOURCE_TYPE_VALUES)[number]>]: Lowercase<K>;
};

// ==================== INQUIRY_STATUSES ====================

export const INQUIRY_STATUS_VALUES = [
  'pending',
  'preview_scheduled',
  'preview_done',
  'offer_sent',
  'offer_accepted',
  'offer_rejected',
  'cancelled',
] as const;

export const INQUIRY_STATUSES = Object.fromEntries(
  INQUIRY_STATUS_VALUES.map((status) => [status.toUpperCase(), status]),
) as {
  [K in Uppercase<(typeof INQUIRY_STATUS_VALUES)[number]>]: Lowercase<K>;
};

// ==================== OFFER_STATUSES ====================

export const OFFER_STATUS_VALUES = ['draft', 'sent', 'accepted', 'rejected', 'cancelled'] as const;

export const OFFER_STATUSES = Object.fromEntries(OFFER_STATUS_VALUES.map((status) => [status.toUpperCase(), status])) as {
  [K in Uppercase<(typeof OFFER_STATUS_VALUES)[number]>]: Lowercase<K>;
};

// ==================== VENDOR_QUOTATION_EMAIL_STATUSES ====================

export const VENDOR_QUOTATION_EMAIL_STATUS_VALUES = ['draft', 'sent', 'failed'] as const;

export const VENDOR_QUOTATION_EMAIL_STATUSES = Object.fromEntries(
  VENDOR_QUOTATION_EMAIL_STATUS_VALUES.map((status) => [status.toUpperCase(), status]),
) as {
  [K in Uppercase<(typeof VENDOR_QUOTATION_EMAIL_STATUS_VALUES)[number]>]: Lowercase<K>;
};

// ==================== INVENTORY_TRANSACTION_TYPES ====================

export const INVENTORY_TRANSACTION_TYPE_VALUES = ['receipt', 'issue', 'return'] as const;

export const INVENTORY_TRANSACTION_TYPES = Object.fromEntries(
  INVENTORY_TRANSACTION_TYPE_VALUES.map((type) => [type.toUpperCase(), type]),
) as {
  [K in Uppercase<(typeof INVENTORY_TRANSACTION_TYPE_VALUES)[number]>]: Lowercase<K>;
};
