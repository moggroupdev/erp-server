CREATE TYPE "public"."dimension_unit" AS ENUM('m', 'cm', 'mm');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('pending', 'preview_scheduled', 'preview_done', 'offer_sent', 'offer_accepted', 'offer_rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_transaction_type" AS ENUM('receipt', 'issue', 'return');--> statement-breakpoint
CREATE TYPE "public"."login_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."maintenance_service_location" AS ENUM('on_site', 'in_factory');--> statement-breakpoint
CREATE TYPE "public"."maintenance_type" AS ENUM('in_warranty', 'out_of_warranty', 'service_contract');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('raw_materials', 'spare_parts');--> statement-breakpoint
CREATE TYPE "public"."material_unit" AS ENUM('count', 'kg', 'gram', 'meter', 'cm', 'liter', 'sheet', 'roll', 'box');--> statement-breakpoint
CREATE TYPE "public"."negotiation_party" AS ENUM('customer', 'company');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'list_users', 'update_user', 'delete_user', 'add_role', 'list_roles', 'update_role', 'delete_role');--> statement-breakpoint
CREATE TYPE "public"."product_source_type" AS ENUM('manufactured', 'imported');--> statement-breakpoint
CREATE TYPE "public"."production_sub_department" AS ENUM('cutting', 'bending', 'refrigeration', 'electricity', 'gas', 'injection', 'sheet_metal_neutral', 'sheet_metal_cold', 'sheet_metal_hot', 'blacksmithing');--> statement-breakpoint
CREATE TYPE "public"."service_contract_interval" AS ENUM('monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."vendor_quotation_email_status" AS ENUM('draft', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "material_category_mains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "material_category_mains_legacy_code_unique" UNIQUE("legacy_code")
);
--> statement-breakpoint
CREATE TABLE "material_category_subs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"title" text NOT NULL,
	"main_category_id" uuid NOT NULL,
	CONSTRAINT "material_category_subs_main_legacy_code_unique" UNIQUE("main_category_id","legacy_code")
);
--> statement-breakpoint
CREATE TABLE "product_category_mains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "product_category_mains_legacy_code_unique" UNIQUE("legacy_code")
);
--> statement-breakpoint
CREATE TABLE "product_category_subs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"title" text NOT NULL,
	"main_category_id" uuid NOT NULL,
	CONSTRAINT "product_category_subs_main_legacy_code_unique" UNIQUE("main_category_id","legacy_code")
);
--> statement-breakpoint
CREATE TABLE "contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"product_dimension_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"title" text,
	"notes" text,
	"unit_price" numeric(15, 3) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"previous_version_id" uuid,
	CONSTRAINT "contract_items_quantity_positive" CHECK ("contract_items"."quantity" > 0),
	CONSTRAINT "contract_items_unit_price_positive" CHECK ("contract_items"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"preview_id" uuid,
	"offer_id" uuid,
	"delivery_address_id" uuid NOT NULL,
	"delivery_time" timestamp with time zone,
	"total_amount" numeric(15, 3) NOT NULL,
	"discount_pct" numeric(5, 2),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "contracts_code_unique" UNIQUE("code"),
	CONSTRAINT "contracts_preview_id_unique" UNIQUE("preview_id"),
	CONSTRAINT "contracts_offer_id_unique" UNIQUE("offer_id"),
	CONSTRAINT "contracts_completed_cancelled_exclusive" CHECK ("contracts"."completed_at" IS NULL OR "contracts"."cancelled_at" IS NULL),
	CONSTRAINT "contracts_completed_after_started" CHECK ("contracts"."completed_at" IS NULL OR "contracts"."started_at" IS NULL OR "contracts"."completed_at" >= "contracts"."started_at"),
	CONSTRAINT "contracts_cancelled_after_started" CHECK ("contracts"."cancelled_at" IS NULL OR "contracts"."started_at" IS NULL OR "contracts"."cancelled_at" >= "contracts"."started_at"),
	CONSTRAINT "contracts_total_amount_non_negative" CHECK ("contracts"."total_amount" >= 0),
	CONSTRAINT "contracts_discount_pct_check" CHECK ("contracts"."discount_pct" IS NULL OR ("contracts"."discount_pct" >= 0 AND "contracts"."discount_pct" <= 100))
);
--> statement-breakpoint
CREATE TABLE "customer_reception_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_reception_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "customer_reception_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "customer_receptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"delivery_id" uuid,
	"installation_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "customer_receptions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"city_id" uuid,
	"address_line" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code"),
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"trip_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "deliveries_code_unique" UNIQUE("code"),
	CONSTRAINT "deliveries_completed_cancelled_exclusive" CHECK ("deliveries"."completed_at" IS NULL OR "deliveries"."cancelled_at" IS NULL),
	CONSTRAINT "deliveries_completed_at_gte_scheduled_at" CHECK ("deliveries"."completed_at" IS NULL OR "deliveries"."scheduled_at" IS NULL OR "deliveries"."completed_at" >= "deliveries"."scheduled_at"),
	CONSTRAINT "deliveries_cancelled_at_gte_scheduled_at" CHECK ("deliveries"."cancelled_at" IS NULL OR "deliveries"."scheduled_at" IS NULL OR "deliveries"."cancelled_at" >= "deliveries"."scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "delivery_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"parent_id" uuid,
	"manager_id" uuid
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"role_id" uuid NOT NULL,
	"permission" "permission" NOT NULL,
	CONSTRAINT "permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_discount_pct" numeric(5, 2),
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_max_discount_pct_check" CHECK ("roles"."max_discount_pct" IS NULL OR ("roles"."max_discount_pct" >= 0 AND "roles"."max_discount_pct" <= 100))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"is_phone_verified" boolean DEFAULT false NOT NULL,
	"email" text,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"role_id" uuid,
	"department_id" uuid,
	"production_sub_department" "production_sub_department",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_code_unique" UNIQUE("code"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_admin_or_role_check" CHECK (("users"."is_admin" = true AND "users"."role_id" IS NULL) OR ("users"."is_admin" = false AND "users"."role_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "production_sub_department_managers" (
	"sub_department" "production_sub_department" PRIMARY KEY NOT NULL,
	"manager_id" uuid,
	"deputy_manager_id" uuid,
	CONSTRAINT "psdm_manager_deputy_distinct" CHECK ("production_sub_department_managers"."manager_id" IS NULL OR "production_sub_department_managers"."deputy_manager_id" IS NULL OR "production_sub_department_managers"."manager_id" <> "production_sub_department_managers"."deputy_manager_id")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"governorate_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "governorates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"city_id" uuid,
	"address_line" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "vendors_code_unique" UNIQUE("code"),
	CONSTRAINT "vendors_phone_unique" UNIQUE("phone"),
	CONSTRAINT "vendors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "product_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"length" numeric(15, 3) NOT NULL,
	"width" numeric(15, 3) NOT NULL,
	"height" numeric(15, 3) NOT NULL,
	"dimension_unit" "dimension_unit" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_dimensions_length_non_negative" CHECK ("product_dimensions"."length" >= 0),
	CONSTRAINT "product_dimensions_width_non_negative" CHECK ("product_dimensions"."width" >= 0),
	CONSTRAINT "product_dimensions_height_non_negative" CHECK ("product_dimensions"."height" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_production_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"production_sub_department" "production_sub_department" NOT NULL,
	"sequence_order" integer NOT NULL,
	"completion_percentage" numeric(5, 2) NOT NULL,
	CONSTRAINT "product_production_routes_product_sub_dept_unique" UNIQUE("product_code","production_sub_department"),
	CONSTRAINT "product_production_routes_product_sequence_unique" UNIQUE("product_code","sequence_order"),
	CONSTRAINT "product_production_routes_sequence_order_positive" CHECK ("product_production_routes"."sequence_order" > 0),
	CONSTRAINT "product_production_routes_completion_percentage_range" CHECK ("product_production_routes"."completion_percentage" > 0 AND "product_production_routes"."completion_percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "product_standard_boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_dimension_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity_required" numeric(15, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_standard_boms_dimension_material_unique" UNIQUE("product_dimension_id","material_code"),
	CONSTRAINT "product_standard_boms_quantity_required_positive" CHECK ("product_standard_boms"."quantity_required" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"code" text PRIMARY KEY NOT NULL,
	"legacy_code" text,
	"title" text NOT NULL,
	"description" text,
	"sub_category_id" uuid NOT NULL,
	"source_type" "product_source_type" NOT NULL,
	"estimated_production_time" integer,
	"pricing_factor" numeric(15, 3) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "products_legacy_code_unique" UNIQUE("legacy_code"),
	CONSTRAINT "products_estimated_production_time_positive" CHECK ("products"."estimated_production_time" IS NULL OR "products"."estimated_production_time" > 0),
	CONSTRAINT "products_pricing_factor_positive" CHECK ("products"."pricing_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"code" text PRIMARY KEY NOT NULL,
	"legacy_code" text,
	"title" text NOT NULL,
	"description" text,
	"sub_category_id" uuid NOT NULL,
	"material_type" "material_type" NOT NULL,
	"unit" "material_unit" NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"quantity" numeric(15, 3) DEFAULT 0 NOT NULL,
	"initial_quantity" numeric(15, 3) DEFAULT 0,
	"minimum_stock" numeric(15, 3),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "materials_legacy_code_unique" UNIQUE("legacy_code"),
	CONSTRAINT "materials_quantity_non_negative" CHECK ("materials"."quantity" >= 0),
	CONSTRAINT "materials_initial_quantity_non_negative" CHECK ("materials"."initial_quantity" IS NULL OR "materials"."initial_quantity" >= 0),
	CONSTRAINT "materials_minimum_stock_non_negative" CHECK ("materials"."minimum_stock" IS NULL OR "materials"."minimum_stock" >= 0),
	CONSTRAINT "materials_unit_cost_positive" CHECK ("materials"."unit_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "inquiry_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"product_dimension_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"title" text,
	"notes" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inquiry_items_quantity_positive" CHECK ("inquiry_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "preview_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_id" uuid NOT NULL,
	"product_dimension_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"trip_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"assigned_to" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "previews_completed_cancelled_exclusive" CHECK ("previews"."completed_at" IS NULL OR "previews"."cancelled_at" IS NULL),
	CONSTRAINT "previews_completed_at_gte_scheduled_at" CHECK ("previews"."completed_at" IS NULL OR "previews"."completed_at" >= "previews"."scheduled_at"),
	CONSTRAINT "previews_cancelled_at_gte_scheduled_at" CHECK ("previews"."cancelled_at" IS NULL OR "previews"."cancelled_at" >= "previews"."scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "offer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"product_dimension_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"title" text,
	"notes" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	CONSTRAINT "offer_items_quantity_positive" CHECK ("offer_items"."quantity" > 0),
	CONSTRAINT "offer_items_unit_price_positive" CHECK ("offer_items"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "offer_negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"party" "negotiation_party" NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "offer_negotiations_discount_pct_check" CHECK ("offer_negotiations"."discount_pct" >= 0 AND "offer_negotiations"."discount_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"valid_until" timestamp with time zone,
	"total_amount" numeric(15, 3) NOT NULL,
	"discount_pct" numeric(5, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "offers_total_amount_non_negative" CHECK ("offers"."total_amount" >= 0),
	CONSTRAINT "offers_discount_pct_check" CHECK ("offers"."discount_pct" IS NULL OR ("offers"."discount_pct" >= 0 AND "offers"."discount_pct" <= 100))
);
--> statement-breakpoint
CREATE TABLE "production_plan_item_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"production_stage" "production_sub_department" NOT NULL,
	"start_date" timestamp with time zone,
	"estimated_end_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "production_plan_items_estimated_end_date_gte_start_date" CHECK ("production_plan_items"."estimated_end_date" IS NULL OR "production_plan_items"."start_date" IS NULL OR "production_plan_items"."estimated_end_date" >= "production_plan_items"."start_date"),
	CONSTRAINT "production_plan_items_completed_at_gte_start_date" CHECK ("production_plan_items"."completed_at" IS NULL OR "production_plan_items"."start_date" IS NULL OR "production_plan_items"."completed_at" >= "production_plan_items"."start_date"),
	CONSTRAINT "production_plan_items_completed_cancelled_exclusive" CHECK ("production_plan_items"."completed_at" IS NULL OR "production_plan_items"."cancelled_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "production_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "production_plans_code_unique" UNIQUE("code"),
	CONSTRAINT "production_plans_end_date_gte_start_date" CHECK ("production_plans"."end_date" >= "production_plans"."start_date")
);
--> statement-breakpoint
CREATE TABLE "inventory_transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"material_purchase_receipt_item_id" uuid,
	"production_plan_item_id" uuid,
	"maintenance_order_spare_part_id" uuid,
	CONSTRAINT "inv_tx_items_quantity_positive" CHECK ("inventory_transaction_items"."quantity" > 0),
	CONSTRAINT "inv_tx_items_unit_cost_positive" CHECK ("inventory_transaction_items"."unit_cost" > 0),
	CONSTRAINT "inv_tx_items_source_non_conflicting" CHECK ((
        ("inventory_transaction_items"."material_purchase_receipt_item_id" IS NULL OR "inventory_transaction_items"."production_plan_item_id" IS NULL)
        AND ("inventory_transaction_items"."material_purchase_receipt_item_id" IS NULL OR "inventory_transaction_items"."maintenance_order_spare_part_id" IS NULL)
        AND ("inventory_transaction_items"."production_plan_item_id" IS NULL OR "inventory_transaction_items"."maintenance_order_spare_part_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"transaction_type" "inventory_transaction_type" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "inventory_transactions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vendor_quotation_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "vendor_quotation_email_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_purchase_order_item_contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_item_id" uuid NOT NULL,
	"contract_item_id" uuid NOT NULL,
	"quantity_allocated" numeric(15, 3),
	CONSTRAINT "mpoici_mpoi_contract_item_unique" UNIQUE("material_purchase_order_item_id","contract_item_id"),
	CONSTRAINT "mpoici_quantity_allocated_positive" CHECK ("material_purchase_order_item_contract_items"."quantity_allocated" IS NULL OR "material_purchase_order_item_contract_items"."quantity_allocated" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_order_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity_ordered" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "mpoi_mpo_material_unique" UNIQUE("material_purchase_order_id","material_code"),
	CONSTRAINT "mpoi_quantity_ordered_positive" CHECK ("material_purchase_order_items"."quantity_ordered" > 0),
	CONSTRAINT "mpoi_unit_cost_positive" CHECK ("material_purchase_order_items"."unit_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_purchase_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "mpo_completed_cancelled_exclusive" CHECK ("material_purchase_orders"."completed_at" IS NULL OR "material_purchase_orders"."cancelled_at" IS NULL),
	CONSTRAINT "mpo_total_amount_non_negative" CHECK ("material_purchase_orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_purchase_receipt_id" uuid NOT NULL,
	"material_purchase_order_item_id" uuid NOT NULL,
	"quantity_received" numeric(15, 3) NOT NULL,
	"quantity_rejected" numeric(15, 3) DEFAULT 0 NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "mpri_receipt_mpoi_unique" UNIQUE("material_purchase_receipt_id","material_purchase_order_item_id"),
	CONSTRAINT "mpri_quantity_received_non_negative" CHECK ("material_purchase_receipt_items"."quantity_received" >= 0),
	CONSTRAINT "mpri_quantity_rejected_non_negative" CHECK ("material_purchase_receipt_items"."quantity_rejected" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"material_purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_purchase_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_purchase_order_id" uuid NOT NULL,
	"contract_item_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "ppoi_ppo_contract_item_unique" UNIQUE("product_purchase_order_id","contract_item_id"),
	CONSTRAINT "ppoi_quantity_ordered_positive" CHECK ("product_purchase_order_items"."quantity_ordered" > 0),
	CONSTRAINT "ppoi_unit_cost_positive" CHECK ("product_purchase_order_items"."unit_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_purchase_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "ppo_completed_cancelled_exclusive" CHECK ("product_purchase_orders"."completed_at" IS NULL OR "product_purchase_orders"."cancelled_at" IS NULL),
	CONSTRAINT "ppo_total_amount_non_negative" CHECK ("product_purchase_orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_purchase_receipt_id" uuid NOT NULL,
	"product_purchase_order_item_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "product_purchase_receipt_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "product_purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_purchase_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "trips_code_unique" UNIQUE("code"),
	CONSTRAINT "trips_cancelled_at_gte_scheduled_at" CHECK ("trips"."cancelled_at" IS NULL OR "trips"."scheduled_at" IS NULL OR "trips"."cancelled_at" >= "trips"."scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "installation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "installation_items_product_unit_id_unique" UNIQUE("product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"trip_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "installations_code_unique" UNIQUE("code"),
	CONSTRAINT "installations_completed_cancelled_exclusive" CHECK ("installations"."completed_at" IS NULL OR "installations"."cancelled_at" IS NULL),
	CONSTRAINT "installations_completed_at_gte_scheduled_at" CHECK ("installations"."completed_at" IS NULL OR "installations"."scheduled_at" IS NULL OR "installations"."completed_at" >= "installations"."scheduled_at"),
	CONSTRAINT "installations_cancelled_at_gte_scheduled_at" CHECK ("installations"."cancelled_at" IS NULL OR "installations"."scheduled_at" IS NULL OR "installations"."cancelled_at" >= "installations"."scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_address_id" uuid NOT NULL,
	"interval" "service_contract_interval" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "service_agreements_code_unique" UNIQUE("code"),
	CONSTRAINT "service_agreements_ended_at_gt_started_at" CHECK ("service_agreements"."ended_at" IS NULL OR "service_agreements"."ended_at" > "service_agreements"."started_at")
);
--> statement-breakpoint
CREATE TABLE "maintenance_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_order_id" uuid NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "moi_mo_product_unit_unique" UNIQUE("maintenance_order_id","product_unit_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_order_spare_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_order_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"is_billable" boolean NOT NULL,
	"notes" text,
	CONSTRAINT "maintenance_order_spare_parts_quantity_positive" CHECK ("maintenance_order_spare_parts"."quantity" > 0),
	CONSTRAINT "maintenance_order_spare_parts_unit_price_positive" CHECK ("maintenance_order_spare_parts"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "maintenance_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"maintenance_type" "maintenance_type" NOT NULL,
	"service_agreement_id" uuid,
	"service_location" "maintenance_service_location" NOT NULL,
	"customer_address_id" uuid,
	"customer_id" uuid NOT NULL,
	"trip_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "maintenance_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "maintenance_orders_service_agreement_required" CHECK ("maintenance_orders"."maintenance_type" <> 'service_contract' OR "maintenance_orders"."service_agreement_id" IS NOT NULL),
	CONSTRAINT "maintenance_orders_customer_address_null_service_contract" CHECK ("maintenance_orders"."maintenance_type" <> 'service_contract' OR "maintenance_orders"."customer_address_id" IS NULL),
	CONSTRAINT "maintenance_orders_completed_cancelled_exclusive" CHECK ("maintenance_orders"."completed_at" IS NULL OR "maintenance_orders"."cancelled_at" IS NULL),
	CONSTRAINT "maintenance_orders_completed_at_gte_scheduled_at" CHECK ("maintenance_orders"."completed_at" IS NULL OR "maintenance_orders"."scheduled_at" IS NULL OR "maintenance_orders"."completed_at" >= "maintenance_orders"."scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"device_id" varchar(255),
	"location_country" varchar(100),
	"location_city" varchar(100),
	"location_lat" numeric(10, 8),
	"location_lng" numeric(11, 8),
	"status" "login_status" NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"vendor_serial_number" text,
	"contract_item_id" uuid NOT NULL,
	"produced_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"installed_at" timestamp with time zone,
	"warranty_started_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_units_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "product_units_vendor_serial_number_unique" UNIQUE("vendor_serial_number")
);
--> statement-breakpoint
ALTER TABLE "material_category_subs" ADD CONSTRAINT "mat_cat_subs_main_cat_id_fk" FOREIGN KEY ("main_category_id") REFERENCES "public"."material_category_mains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_subs" ADD CONSTRAINT "prod_cat_subs_main_cat_id_fk" FOREIGN KEY ("main_category_id") REFERENCES "public"."product_category_mains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_previous_version_id_contract_items_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_delivery_address_id_customer_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reception_items" ADD CONSTRAINT "customer_reception_items_customer_reception_id_customer_receptions_id_fk" FOREIGN KEY ("customer_reception_id") REFERENCES "public"."customer_receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reception_items" ADD CONSTRAINT "customer_reception_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_receptions" ADD CONSTRAINT "customer_receptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ADD CONSTRAINT "psdm_manager_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sub_department_managers" ADD CONSTRAINT "psdm_deputy_manager_id_fk" FOREIGN KEY ("deputy_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_production_routes" ADD CONSTRAINT "product_production_routes_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "product_standard_boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_standard_boms" ADD CONSTRAINT "psb_product_dimension_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_product_category_subs_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."product_category_subs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_sub_category_id_material_category_subs_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."material_category_subs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_dimension_id_product_dimensions_id_fk" FOREIGN KEY ("product_dimension_id") REFERENCES "public"."product_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_negotiations" ADD CONSTRAINT "offer_negotiations_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_negotiations" ADD CONSTRAINT "offer_negotiations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_item_notes" ADD CONSTRAINT "production_plan_item_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_item_notes" ADD CONSTRAINT "pp_item_notes_plan_item_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_plan_id_production_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."production_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inventory_transaction_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_tx_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_mpri_id_fk" FOREIGN KEY ("material_purchase_receipt_item_id") REFERENCES "public"."material_purchase_receipt_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_pp_item_id_fk" FOREIGN KEY ("production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_mosp_id_fk" FOREIGN KEY ("maintenance_order_spare_part_id") REFERENCES "public"."maintenance_order_spare_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quotation_emails" ADD CONSTRAINT "vendor_quotation_emails_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quotation_emails" ADD CONSTRAINT "vendor_quotation_emails_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_contract_items" ADD CONSTRAINT "mpoici_mpoi_id_fk" FOREIGN KEY ("material_purchase_order_item_id") REFERENCES "public"."material_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_item_contract_items" ADD CONSTRAINT "mpoici_contract_item_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD CONSTRAINT "mpoi_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ADD CONSTRAINT "mpri_receipt_id_fk" FOREIGN KEY ("material_purchase_receipt_id") REFERENCES "public"."material_purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ADD CONSTRAINT "mpri_mpoi_id_fk" FOREIGN KEY ("material_purchase_order_item_id") REFERENCES "public"."material_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "material_purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "material_purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_purchase_receipts" ADD CONSTRAINT "mpr_mpo_id_fk" FOREIGN KEY ("material_purchase_order_id") REFERENCES "public"."material_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "ppoi_ppo_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_order_items" ADD CONSTRAINT "ppoi_contract_item_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_orders" ADD CONSTRAINT "product_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_orders" ADD CONSTRAINT "product_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_receipt_id_fk" FOREIGN KEY ("product_purchase_receipt_id") REFERENCES "public"."product_purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_ppoi_id_fk" FOREIGN KEY ("product_purchase_order_item_id") REFERENCES "public"."product_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipt_items" ADD CONSTRAINT "ppri_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "product_purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "product_purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_purchase_receipts" ADD CONSTRAINT "ppr_ppo_id_fk" FOREIGN KEY ("product_purchase_order_id") REFERENCES "public"."product_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_customer_address_id_customer_addresses_id_fk" FOREIGN KEY ("customer_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_items" ADD CONSTRAINT "maintenance_order_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_items" ADD CONSTRAINT "moi_mo_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_spare_parts" ADD CONSTRAINT "maintenance_order_spare_parts_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_order_spare_parts" ADD CONSTRAINT "mosp_mo_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_customer_address_id_customer_addresses_id_fk" FOREIGN KEY ("customer_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "mo_service_agreement_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_contract_item_id_contract_items_id_fk" FOREIGN KEY ("contract_item_id") REFERENCES "public"."contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_category_mains_title_idx" ON "material_category_mains" USING btree ("title");--> statement-breakpoint
CREATE INDEX "material_category_subs_main_category_id_idx" ON "material_category_subs" USING btree ("main_category_id");--> statement-breakpoint
CREATE INDEX "material_category_subs_title_idx" ON "material_category_subs" USING btree ("title");--> statement-breakpoint
CREATE INDEX "product_category_mains_title_idx" ON "product_category_mains" USING btree ("title");--> statement-breakpoint
CREATE INDEX "product_category_subs_main_category_id_idx" ON "product_category_subs" USING btree ("main_category_id");--> statement-breakpoint
CREATE INDEX "product_category_subs_title_idx" ON "product_category_subs" USING btree ("title");--> statement-breakpoint
CREATE INDEX "contract_items_contract_id_idx" ON "contract_items" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_items_product_dimension_id_idx" ON "contract_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "contract_items_product_code_idx" ON "contract_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "contract_items_created_by_idx" ON "contract_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contract_items_cancelled_at_idx" ON "contract_items" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "contract_items_previous_version_id_idx" ON "contract_items" USING btree ("previous_version_id");--> statement-breakpoint
CREATE INDEX "contracts_inquiry_id_idx" ON "contracts" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "contracts_customer_id_idx" ON "contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "contracts_delivery_address_id_idx" ON "contracts" USING btree ("delivery_address_id");--> statement-breakpoint
CREATE INDEX "contracts_delivery_time_idx" ON "contracts" USING btree ("delivery_time");--> statement-breakpoint
CREATE INDEX "contracts_started_at_idx" ON "contracts" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "contracts_completed_at_idx" ON "contracts" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "contracts_cancelled_at_idx" ON "contracts" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "contracts_created_at_idx" ON "contracts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contracts_created_by_idx" ON "contracts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "customer_reception_items_reception_id_idx" ON "customer_reception_items" USING btree ("customer_reception_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_customer_id_idx" ON "customer_receptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_delivery_id_idx" ON "customer_receptions" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_installation_id_idx" ON "customer_receptions" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "customer_receptions_received_at_idx" ON "customer_receptions" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "customer_receptions_created_by_idx" ON "customer_receptions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_city_id_idx" ON "customer_addresses" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_country_id_idx" ON "customer_addresses" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "deliveries_contract_id_idx" ON "deliveries" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "deliveries_trip_id_idx" ON "deliveries" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "deliveries_scheduled_at_idx" ON "deliveries" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "deliveries_completed_at_idx" ON "deliveries" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "deliveries_cancelled_at_idx" ON "deliveries" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "deliveries_assigned_to_idx" ON "deliveries" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "deliveries_created_by_idx" ON "deliveries" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "delivery_items_delivery_id_idx" ON "delivery_items" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "departments_name_en_idx" ON "departments" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "departments_name_ar_idx" ON "departments" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "departments_parent_id_idx" ON "departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "departments_manager_id_idx" ON "departments" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "permissions_role_id_idx" ON "permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_created_by_idx" ON "roles" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "roles_department_id_idx" ON "roles" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "users_name_idx" ON "users" USING btree ("name");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_department_id_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "users_production_sub_department_idx" ON "users" USING btree ("production_sub_department");--> statement-breakpoint
CREATE INDEX "psdm_manager_id_idx" ON "production_sub_department_managers" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "psdm_deputy_manager_id_idx" ON "production_sub_department_managers" USING btree ("deputy_manager_id");--> statement-breakpoint
CREATE INDEX "cities_governorate_id_idx" ON "cities" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "cities_name_en_idx" ON "cities" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "cities_name_ar_idx" ON "cities" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "countries_name_en_idx" ON "countries" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "countries_name_ar_idx" ON "countries" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "governorates_name_en_idx" ON "governorates" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "governorates_name_ar_idx" ON "governorates" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "vendor_addresses_vendor_id_idx" ON "vendor_addresses" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_addresses_city_id_idx" ON "vendor_addresses" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "vendor_addresses_country_id_idx" ON "vendor_addresses" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_addresses_one_default" ON "vendor_addresses" USING btree ("vendor_id") WHERE "vendor_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_dimensions_product_code_idx" ON "product_dimensions" USING btree ("product_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_dimensions_default_per_product_idx" ON "product_dimensions" USING btree ("product_code") WHERE "product_dimensions"."is_default" = true;--> statement-breakpoint
CREATE INDEX "product_production_routes_product_code_idx" ON "product_production_routes" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "product_standard_boms_product_dimension_id_idx" ON "product_standard_boms" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "product_standard_boms_material_code_idx" ON "product_standard_boms" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "products_title_idx" ON "products" USING btree ("title");--> statement-breakpoint
CREATE INDEX "products_sub_category_id_idx" ON "products" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "materials_title_idx" ON "materials" USING btree ("title");--> statement-breakpoint
CREATE INDEX "materials_sub_category_id_idx" ON "materials" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "inquiries_customer_id_idx" ON "inquiries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiries_created_by_idx" ON "inquiries" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "inquiry_items_inquiry_id_idx" ON "inquiry_items" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "inquiry_items_product_dimension_id_idx" ON "inquiry_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "inquiry_items_product_code_idx" ON "inquiry_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "preview_items_preview_id_idx" ON "preview_items" USING btree ("preview_id");--> statement-breakpoint
CREATE INDEX "preview_items_product_dimension_id_idx" ON "preview_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "preview_items_product_code_idx" ON "preview_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "previews_inquiry_id_idx" ON "previews" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "previews_trip_id_idx" ON "previews" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "previews_scheduled_at_idx" ON "previews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "previews_completed_at_idx" ON "previews" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "previews_cancelled_at_idx" ON "previews" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "previews_assigned_to_idx" ON "previews" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "previews_created_by_idx" ON "previews" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "previews_created_at_idx" ON "previews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offer_items_offer_id_idx" ON "offer_items" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_items_product_dimension_id_idx" ON "offer_items" USING btree ("product_dimension_id");--> statement-breakpoint
CREATE INDEX "offer_items_product_code_idx" ON "offer_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "offer_negotiations_offer_id_idx" ON "offer_negotiations" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_negotiations_created_by_idx" ON "offer_negotiations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "offer_negotiations_created_at_idx" ON "offer_negotiations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offers_inquiry_id_idx" ON "offers" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offers_created_at_idx" ON "offers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offers_created_by_idx" ON "offers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "production_plan_item_notes_plan_item_id_idx" ON "production_plan_item_notes" USING btree ("plan_item_id");--> statement-breakpoint
CREATE INDEX "production_plan_item_notes_created_by_idx" ON "production_plan_item_notes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "production_plan_items_plan_id_idx" ON "production_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "production_plan_items_product_unit_id_idx" ON "production_plan_items" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "production_plan_items_production_stage_idx" ON "production_plan_items" USING btree ("production_stage");--> statement-breakpoint
CREATE INDEX "production_plan_items_completed_at_idx" ON "production_plan_items" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "production_plan_items_cancelled_at_idx" ON "production_plan_items" USING btree ("cancelled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_plan_items_plan_unit_stage_active_unique" ON "production_plan_items" USING btree ("plan_id","product_unit_id","production_stage") WHERE "production_plan_items"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "production_plans_name_idx" ON "production_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "production_plans_start_date_idx" ON "production_plans" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "production_plans_end_date_idx" ON "production_plans" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "inv_tx_items_transaction_id_idx" ON "inventory_transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_material_code_idx" ON "inventory_transaction_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "inv_tx_items_mpri_id_idx" ON "inventory_transaction_items" USING btree ("material_purchase_receipt_item_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_pp_item_id_idx" ON "inventory_transaction_items" USING btree ("production_plan_item_id");--> statement-breakpoint
CREATE INDEX "inv_tx_items_mosp_id_idx" ON "inventory_transaction_items" USING btree ("maintenance_order_spare_part_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_transaction_type_idx" ON "inventory_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_by_idx" ON "inventory_transactions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_vendor_id_idx" ON "vendor_quotation_emails" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_status_idx" ON "vendor_quotation_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_created_at_idx" ON "vendor_quotation_emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_created_by_idx" ON "vendor_quotation_emails" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpoici_mpoi_id_idx" ON "material_purchase_order_item_contract_items" USING btree ("material_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "mpoici_contract_item_id_idx" ON "material_purchase_order_item_contract_items" USING btree ("contract_item_id");--> statement-breakpoint
CREATE INDEX "mpoi_mpo_id_idx" ON "material_purchase_order_items" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE INDEX "mpoi_material_code_idx" ON "material_purchase_order_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "mpo_vendor_id_idx" ON "material_purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "mpo_completed_at_idx" ON "material_purchase_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "mpo_cancelled_at_idx" ON "material_purchase_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "mpo_created_at_idx" ON "material_purchase_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mpo_created_by_idx" ON "material_purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpri_receipt_id_idx" ON "material_purchase_receipt_items" USING btree ("material_purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "mpri_mpoi_id_idx" ON "material_purchase_receipt_items" USING btree ("material_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "mpr_mpo_id_idx" ON "material_purchase_receipts" USING btree ("material_purchase_order_id");--> statement-breakpoint
CREATE INDEX "mpr_received_at_idx" ON "material_purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "mpr_received_by_idx" ON "material_purchase_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "mpr_created_by_idx" ON "material_purchase_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "mpr_created_at_idx" ON "material_purchase_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppoi_ppo_id_idx" ON "product_purchase_order_items" USING btree ("product_purchase_order_id");--> statement-breakpoint
CREATE INDEX "ppoi_contract_item_id_idx" ON "product_purchase_order_items" USING btree ("contract_item_id");--> statement-breakpoint
CREATE INDEX "ppo_vendor_id_idx" ON "product_purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "ppo_created_at_idx" ON "product_purchase_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppo_created_by_idx" ON "product_purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "ppo_completed_at_idx" ON "product_purchase_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "ppo_cancelled_at_idx" ON "product_purchase_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "ppri_receipt_id_idx" ON "product_purchase_receipt_items" USING btree ("product_purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "ppri_ppoi_id_idx" ON "product_purchase_receipt_items" USING btree ("product_purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "ppr_ppo_id_idx" ON "product_purchase_receipts" USING btree ("product_purchase_order_id");--> statement-breakpoint
CREATE INDEX "ppr_received_at_idx" ON "product_purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "ppr_received_by_idx" ON "product_purchase_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "ppr_created_at_idx" ON "product_purchase_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ppr_created_by_idx" ON "product_purchase_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "trips_scheduled_at_idx" ON "trips" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "trips_cancelled_at_idx" ON "trips" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "trips_created_at_idx" ON "trips" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trips_created_by_idx" ON "trips" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "installation_items_installation_id_idx" ON "installation_items" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "installations_contract_id_idx" ON "installations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "installations_trip_id_idx" ON "installations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "installations_scheduled_at_idx" ON "installations" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "installations_completed_at_idx" ON "installations" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "installations_cancelled_at_idx" ON "installations" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "installations_assigned_to_idx" ON "installations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "installations_created_by_idx" ON "installations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "service_agreements_customer_address_id_idx" ON "service_agreements" USING btree ("customer_address_id");--> statement-breakpoint
CREATE INDEX "service_agreements_started_at_idx" ON "service_agreements" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "maintenance_order_items_maintenance_order_id_idx" ON "maintenance_order_items" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "maintenance_order_items_product_unit_id_idx" ON "maintenance_order_items" USING btree ("product_unit_id");--> statement-breakpoint
CREATE INDEX "maintenance_order_spare_parts_maintenance_order_id_idx" ON "maintenance_order_spare_parts" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "maintenance_order_spare_parts_material_code_idx" ON "maintenance_order_spare_parts" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "maintenance_orders_customer_id_idx" ON "maintenance_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "maintenance_orders_service_agreement_id_idx" ON "maintenance_orders" USING btree ("service_agreement_id");--> statement-breakpoint
CREATE INDEX "maintenance_orders_customer_address_id_idx" ON "maintenance_orders" USING btree ("customer_address_id");--> statement-breakpoint
CREATE INDEX "maintenance_orders_trip_id_idx" ON "maintenance_orders" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "maintenance_orders_scheduled_at_idx" ON "maintenance_orders" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "maintenance_orders_completed_at_idx" ON "maintenance_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "maintenance_orders_cancelled_at_idx" ON "maintenance_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "maintenance_orders_assigned_to_idx" ON "maintenance_orders" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "maintenance_orders_created_by_idx" ON "maintenance_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "login_history_user_id_idx" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_history_status_idx" ON "login_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "login_history_created_at_idx" ON "login_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_units_contract_item_id_idx" ON "product_units" USING btree ("contract_item_id");--> statement-breakpoint
CREATE INDEX "product_units_created_at_idx" ON "product_units" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_units_produced_at_idx" ON "product_units" USING btree ("produced_at");--> statement-breakpoint
CREATE INDEX "product_units_received_at_idx" ON "product_units" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "product_units_delivered_at_idx" ON "product_units" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "product_units_installed_at_idx" ON "product_units" USING btree ("installed_at");--> statement-breakpoint
CREATE INDEX "product_units_warranty_started_at_idx" ON "product_units" USING btree ("warranty_started_at");--> statement-breakpoint
CREATE INDEX "product_units_cancelled_at_idx" ON "product_units" USING btree ("cancelled_at");