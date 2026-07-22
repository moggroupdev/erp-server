export const REQUEST_USER_KEY = 'user';
export const ALLOWED_PERMISSION_KEY = 'allowedPermission';

export const TOKEN_TYPE_VALUES = ['access', 'refresh'] as const;
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Seeded Production root department — see data/departments.csv */
export const PRODUCTION_DEPARTMENT_ID = '3f2a91bc-4d8e-4a1f-b563-7c94e21a0b01';

/** Seeded Egypt country — see data/locations/countries.csv */
export const EGYPT_COUNTRY_ID = 'f1dd27d6-ac02-5671-97b2-0679193340c4';

// ==================== PERMISSIONS ====================

export const PERMISSION_VALUES = [
  'add_user',
  'read_users',
  'update_user',
  'delete_user',
  'add_role',
  'read_roles',
  'update_role',
  'delete_role',
  'add_department',
  'read_departments',
  'update_department',
  'add_vendor',
  'read_vendors',
  'update_vendor',
  'add_customer',
  'read_customers',
  'update_customer',
  'add_material',
  'read_materials',
  'update_material',
  'read_material_reports',
  'add_product',
  'read_products',
  'update_product',
  'add_product_bom',
  'read_product_boms',
  'update_product_bom',
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

// ==================== NEGOTIATION_PARTIES ====================

export const NEGOTIATION_PARTY_VALUES = ['customer', 'company'] as const;

export const NEGOTIATION_PARTIES = Object.fromEntries(
  NEGOTIATION_PARTY_VALUES.map((party) => [party.toUpperCase(), party]),
) as {
  [K in Uppercase<(typeof NEGOTIATION_PARTY_VALUES)[number]>]: Lowercase<K>;
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

// ==================== PRODUCTION_SUB_DEPARTMENTS ====================

export const PRODUCTION_SUB_DEPARTMENT_VALUES = [
  'cutting',
  'bending',
  'refrigeration',
  'electricity',
  'gas',
  'injection',
  'sheet_metal_neutral',
  'sheet_metal_cold',
  'sheet_metal_hot',
  'blacksmithing',
] as const;

export const PRODUCTION_SUB_DEPARTMENTS = Object.fromEntries(
  PRODUCTION_SUB_DEPARTMENT_VALUES.map((subDepartment) => [subDepartment.toUpperCase(), subDepartment]),
) as {
  [K in Uppercase<(typeof PRODUCTION_SUB_DEPARTMENT_VALUES)[number]>]: Lowercase<K>;
};

// ==================== MAINTENANCE_TYPES ====================

export const MAINTENANCE_TYPE_VALUES = ['in_warranty', 'out_of_warranty', 'service_contract'] as const;

export const MAINTENANCE_TYPES = Object.fromEntries(MAINTENANCE_TYPE_VALUES.map((type) => [type.toUpperCase(), type])) as {
  [K in Uppercase<(typeof MAINTENANCE_TYPE_VALUES)[number]>]: Lowercase<K>;
};

// ==================== MAINTENANCE_SERVICE_LOCATIONS ====================

export const MAINTENANCE_SERVICE_LOCATION_VALUES = ['on_site', 'in_factory'] as const;

export const MAINTENANCE_SERVICE_LOCATIONS = Object.fromEntries(
  MAINTENANCE_SERVICE_LOCATION_VALUES.map((location) => [location.toUpperCase(), location]),
) as {
  [K in Uppercase<(typeof MAINTENANCE_SERVICE_LOCATION_VALUES)[number]>]: Lowercase<K>;
};

// ==================== SERVICE_CONTRACT_INTERVALS ====================

export const SERVICE_CONTRACT_INTERVAL_VALUES = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const;

export const SERVICE_CONTRACT_INTERVALS = Object.fromEntries(
  SERVICE_CONTRACT_INTERVAL_VALUES.map((interval) => [interval.toUpperCase(), interval]),
) as {
  [K in Uppercase<(typeof SERVICE_CONTRACT_INTERVAL_VALUES)[number]>]: Lowercase<K>;
};
