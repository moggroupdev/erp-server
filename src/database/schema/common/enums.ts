import { pgEnum } from 'drizzle-orm/pg-core';
import {
  INQUIRY_STATUS_VALUES,
  LOGIN_STATUS_VALUES,
  MAINTENANCE_SERVICE_LOCATION_VALUES,
  MAINTENANCE_TYPE_VALUES,
  MATERIAL_TYPE_VALUES,
  MATERIAL_UNIT_VALUES,
  NEGOTIATION_PARTY_VALUES,
  OFFER_STATUS_VALUES,
  PERMISSION_VALUES,
  PRODUCT_SOURCE_TYPE_VALUES,
  SERVICE_CONTRACT_INTERVAL_VALUES,
  SUPPLIER_CLASSIFICATION_VALUES,
  CUSTOMER_CLASSIFICATION_VALUES,
  SUPPLIER_QUOTATION_EMAIL_STATUS_VALUES,
  INVENTORY_TRANSACTION_TYPE_VALUES,
  PRODUCTION_SUB_DEPARTMENT_VALUES,
  LEGACY_ISSUE_PERMIT_WORK_ORDER_TYPE_VALUES,
  APPROVAL_DECISION_VALUES,
} from 'src/utils/constants';

export const permissionEnum = pgEnum('permission', PERMISSION_VALUES);

export const approvalDecisionEnum = pgEnum('approval_decision', APPROVAL_DECISION_VALUES);

export const loginStatusEnum = pgEnum('login_status', LOGIN_STATUS_VALUES);

export const materialUnitEnum = pgEnum('material_unit', MATERIAL_UNIT_VALUES);

export const materialTypeEnum = pgEnum('material_type', MATERIAL_TYPE_VALUES);

export const productSourceTypeEnum = pgEnum('product_source_type', PRODUCT_SOURCE_TYPE_VALUES);

export const inquiryStatusEnum = pgEnum('inquiry_status', INQUIRY_STATUS_VALUES);

export const offerStatusEnum = pgEnum('offer_status', OFFER_STATUS_VALUES);

export const negotiationPartyEnum = pgEnum('negotiation_party', NEGOTIATION_PARTY_VALUES);

export const supplierClassificationEnum = pgEnum('supplier_classification', SUPPLIER_CLASSIFICATION_VALUES);

export const customerClassificationEnum = pgEnum('customer_classification', CUSTOMER_CLASSIFICATION_VALUES);

export const supplierQuotationEmailStatusEnum = pgEnum(
  'supplier_quotation_email_status',
  SUPPLIER_QUOTATION_EMAIL_STATUS_VALUES,
);

export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', INVENTORY_TRANSACTION_TYPE_VALUES);

export const productionSubDepartmentEnum = pgEnum('production_sub_department', PRODUCTION_SUB_DEPARTMENT_VALUES);

export const maintenanceTypeEnum = pgEnum('maintenance_type', MAINTENANCE_TYPE_VALUES);

export const maintenanceServiceLocationEnum = pgEnum('maintenance_service_location', MAINTENANCE_SERVICE_LOCATION_VALUES);

export const serviceContractIntervalEnum = pgEnum('service_contract_interval', SERVICE_CONTRACT_INTERVAL_VALUES);

export const legacyIssuePermitWorkOrderTypeEnum = pgEnum('legacy_issue_permit_work_order_type', LEGACY_ISSUE_PERMIT_WORK_ORDER_TYPE_VALUES);
