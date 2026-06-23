CREATE TYPE "public"."dimension_unit" AS ENUM('m', 'cm', 'mm');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('pending', 'preview_scheduled', 'preview_done', 'offer_sent', 'offer_accepted', 'offer_rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_transaction_type" AS ENUM('receipt', 'issue', 'return');--> statement-breakpoint
CREATE TYPE "public"."login_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('raw_materials', 'spare_parts');--> statement-breakpoint
CREATE TYPE "public"."material_unit" AS ENUM('count', 'kg', 'gram', 'meter', 'cm', 'liter', 'sheet', 'roll', 'box');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('add_user', 'list_users', 'update_user', 'delete_user', 'add_role', 'list_roles', 'update_role', 'delete_role');--> statement-breakpoint
CREATE TYPE "public"."product_source_type" AS ENUM('manufactured', 'imported');--> statement-breakpoint
CREATE TYPE "public"."production_stage" AS ENUM('cutting', 'bending', 'refrigeration', 'electricity', 'gas', 'injection', 'neutral_sheet_metal', 'cold_sheet_metal', 'hot_sheet_metal', 'blacksmithing', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."vendor_quotation_email_status" AS ENUM('draft', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity_required" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "boms_order_item_material_unique" UNIQUE("order_item_id","material_code"),
	CONSTRAINT "boms_quantity_required_non_negative" CHECK ("boms"."quantity_required" >= 0)
);
--> statement-breakpoint
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
	"order_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "deliveries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	CONSTRAINT "delivery_items_quantity_positive" CHECK ("delivery_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "governorates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" "permission" NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
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
	"password" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"role_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_code_unique" UNIQUE("code"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_admin_or_role_check" CHECK (("users"."is_admin" = true AND "users"."role_id" IS NULL) OR ("users"."is_admin" = false AND "users"."role_id" IS NOT NULL))
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
CREATE TABLE "product_boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"material_code" text NOT NULL,
	"quantity_required" numeric(15, 3) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_boms_product_material_unique" UNIQUE("product_code","material_code"),
	CONSTRAINT "product_boms_quantity_required_non_negative" CHECK ("product_boms"."quantity_required" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sub_category_id" uuid NOT NULL,
	"source_type" "product_source_type" NOT NULL,
	"length" numeric(15, 3),
	"width" numeric(15, 3),
	"height" numeric(15, 3),
	"dimension_unit" "dimension_unit",
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "products_dimensions_all_or_none" CHECK ((
        ("products"."length" IS NULL AND "products"."width" IS NULL AND "products"."height" IS NULL AND "products"."dimension_unit" IS NULL)
        OR
        ("products"."length" IS NOT NULL AND "products"."width" IS NOT NULL AND "products"."height" IS NOT NULL AND "products"."dimension_unit" IS NOT NULL)
      )),
	CONSTRAINT "products_length_non_negative" CHECK ("products"."length" IS NULL OR "products"."length" >= 0),
	CONSTRAINT "products_width_non_negative" CHECK ("products"."width" IS NULL OR "products"."width" >= 0),
	CONSTRAINT "products_height_non_negative" CHECK ("products"."height" IS NULL OR "products"."height" >= 0)
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"code" text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "materials_quantity_non_negative" CHECK ("materials"."quantity" >= 0),
	CONSTRAINT "materials_initial_quantity_non_negative" CHECK ("materials"."initial_quantity" IS NULL OR "materials"."initial_quantity" >= 0),
	CONSTRAINT "materials_minimum_stock_non_negative" CHECK ("materials"."minimum_stock" IS NULL OR "materials"."minimum_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "inquiry_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"title" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	CONSTRAINT "inquiry_items_quantity_positive" CHECK ("inquiry_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "preview_item_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_item_id" uuid NOT NULL,
	"length" numeric(15, 3) NOT NULL,
	"width" numeric(15, 3) NOT NULL,
	"height" numeric(15, 3) NOT NULL,
	"unit" "dimension_unit" NOT NULL,
	CONSTRAINT "preview_item_dimensions_preview_item_id_unique" UNIQUE("preview_item_id"),
	CONSTRAINT "preview_item_dimensions_length_non_negative" CHECK ("preview_item_dimensions"."length" >= 0),
	CONSTRAINT "preview_item_dimensions_width_non_negative" CHECK ("preview_item_dimensions"."width" >= 0),
	CONSTRAINT "preview_item_dimensions_height_non_negative" CHECK ("preview_item_dimensions"."height" >= 0)
);
--> statement-breakpoint
CREATE TABLE "preview_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_id" uuid NOT NULL,
	"inquiry_item_id" uuid NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"assigned_to" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"inquiry_item_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"title" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "offer_items_quantity_positive" CHECK ("offer_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"length" numeric(15, 3) NOT NULL,
	"width" numeric(15, 3) NOT NULL,
	"height" numeric(15, 3) NOT NULL,
	"unit" "dimension_unit" NOT NULL,
	CONSTRAINT "order_item_dimensions_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "order_item_dimensions_length_non_negative" CHECK ("order_item_dimensions"."length" >= 0),
	CONSTRAINT "order_item_dimensions_width_non_negative" CHECK ("order_item_dimensions"."width" >= 0),
	CONSTRAINT "order_item_dimensions_height_non_negative" CHECK ("order_item_dimensions"."height" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"offer_item_id" uuid,
	"product_code" text NOT NULL,
	"title" text,
	"standard" boolean DEFAULT true NOT NULL,
	"unit_price" numeric(15, 3) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"quantity_produced" integer DEFAULT 0 NOT NULL,
	"notes" text,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_quantity_produced_non_negative" CHECK ("order_items"."quantity_produced" >= 0),
	CONSTRAINT "order_items_quantity_produced_lte_quantity" CHECK ("order_items"."quantity_produced" <= "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"offer_id" uuid,
	"customer_id" uuid NOT NULL,
	"delivery_address_id" uuid NOT NULL,
	"delivery_time" timestamp with time zone,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_offer_id_unique" UNIQUE("offer_id")
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
	"order_item_id" uuid NOT NULL,
	"stage" "production_stage" NOT NULL,
	"start_date" timestamp with time zone,
	"estimated_end_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"quantity_planned" integer DEFAULT 1 NOT NULL,
	"quantity_completed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	CONSTRAINT "production_plan_items_plan_order_stage_unique" UNIQUE("plan_id","order_item_id","stage"),
	CONSTRAINT "production_plan_items_quantity_planned_non_negative" CHECK ("production_plan_items"."quantity_planned" >= 0),
	CONSTRAINT "production_plan_items_quantity_completed_non_negative" CHECK ("production_plan_items"."quantity_completed" >= 0),
	CONSTRAINT "production_plan_items_quantity_completed_lte_planned" CHECK ("production_plan_items"."quantity_completed" <= "production_plan_items"."quantity_planned"),
	CONSTRAINT "production_plan_items_estimated_end_date_gte_start_date" CHECK ("production_plan_items"."estimated_end_date" IS NULL OR "production_plan_items"."start_date" IS NULL OR "production_plan_items"."estimated_end_date" >= "production_plan_items"."start_date"),
	CONSTRAINT "production_plan_items_completed_at_gte_start_date" CHECK ("production_plan_items"."completed_at" IS NULL OR "production_plan_items"."start_date" IS NULL OR "production_plan_items"."completed_at" >= "production_plan_items"."start_date")
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
	"material_code" text,
	"product_code" text,
	"quantity" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"purchase_receipt_item_id" uuid,
	"production_plan_item_id" uuid,
	CONSTRAINT "inventory_transaction_items_quantity_positive" CHECK ("inventory_transaction_items"."quantity" > 0),
	CONSTRAINT "inventory_transaction_items_source_non_conflicting" CHECK ((
        "inventory_transaction_items"."purchase_receipt_item_id" IS NULL OR "inventory_transaction_items"."production_plan_item_id" IS NULL
      )),
	CONSTRAINT "inventory_transaction_items_material_or_product_xor" CHECK ((
        ("inventory_transaction_items"."material_code" IS NOT NULL AND "inventory_transaction_items"."product_code" IS NULL)
        OR
        ("inventory_transaction_items"."material_code" IS NULL AND "inventory_transaction_items"."product_code" IS NOT NULL)
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
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"material_code" text,
	"product_code" text,
	"bom_id" uuid,
	"order_item_id" uuid,
	"quantity_ordered" numeric(15, 3) NOT NULL,
	"unit_cost" numeric(15, 3) NOT NULL,
	"notes" text,
	CONSTRAINT "purchase_order_items_quantity_ordered_non_negative" CHECK ("purchase_order_items"."quantity_ordered" >= 0),
	CONSTRAINT "purchase_order_items_material_or_product_xor" CHECK ((
        ("purchase_order_items"."material_code" IS NOT NULL AND "purchase_order_items"."product_code" IS NULL)
        OR
        ("purchase_order_items"."material_code" IS NULL AND "purchase_order_items"."product_code" IS NOT NULL)
      )),
	CONSTRAINT "purchase_order_items_bom_material_check" CHECK (("purchase_order_items"."bom_id" IS NULL OR "purchase_order_items"."material_code" IS NOT NULL)),
	CONSTRAINT "purchase_order_items_order_item_product_check" CHECK (("purchase_order_items"."order_item_id" IS NULL OR "purchase_order_items"."product_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_amount" numeric(15, 3) NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "purchase_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_receipt_id" uuid NOT NULL,
	"purchase_order_item_id" uuid NOT NULL,
	"quantity_received" numeric(15, 3) NOT NULL,
	"quantity_rejected" numeric(15, 3) DEFAULT 0 NOT NULL,
	"inspection_notes" text,
	CONSTRAINT "purchase_receipt_items_quantity_received_non_negative" CHECK ("purchase_receipt_items"."quantity_received" >= 0),
	CONSTRAINT "purchase_receipt_items_quantity_rejected_non_negative" CHECK ("purchase_receipt_items"."quantity_rejected" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "purchase_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "installation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	CONSTRAINT "installation_items_quantity_positive" CHECK ("installation_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"order_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"installed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"assigned_to" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "installations_code_unique" UNIQUE("code")
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
CREATE TABLE "material_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"material_code" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"from_production_plan_item_id" uuid NOT NULL,
	"to_production_plan_item_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "material_transfer_items_quantity_positive" CHECK ("material_transfer_items"."quantity" > 0),
	CONSTRAINT "material_transfer_items_different_plan_items" CHECK ("material_transfer_items"."from_production_plan_item_id" <> "material_transfer_items"."to_production_plan_item_id")
);
--> statement-breakpoint
CREATE TABLE "material_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_transfers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"production_plan_item_id" uuid NOT NULL,
	"to_order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	CONSTRAINT "product_transfer_items_quantity_positive" CHECK ("product_transfer_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "product_transfers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_category_subs" ADD CONSTRAINT "mat_cat_subs_main_cat_id_fk" FOREIGN KEY ("main_category_id") REFERENCES "public"."material_category_mains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_subs" ADD CONSTRAINT "prod_cat_subs_main_cat_id_fk" FOREIGN KEY ("main_category_id") REFERENCES "public"."product_category_mains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_boms" ADD CONSTRAINT "product_boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_product_category_subs_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."product_category_subs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_sub_category_id_material_category_subs_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."material_category_subs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_item_dimensions" ADD CONSTRAINT "preview_item_dimensions_preview_item_id_preview_items_id_fk" FOREIGN KEY ("preview_item_id") REFERENCES "public"."preview_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_dimensions" ADD CONSTRAINT "order_item_dimensions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offer_item_id_offer_items_id_fk" FOREIGN KEY ("offer_item_id") REFERENCES "public"."offer_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_customer_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_item_notes" ADD CONSTRAINT "production_plan_item_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_item_notes" ADD CONSTRAINT "pp_item_notes_plan_item_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_plan_id_production_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."production_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inventory_transaction_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inventory_transaction_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_tx_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_pr_item_id_fk" FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "public"."purchase_receipt_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inv_tx_items_pp_item_id_fk" FOREIGN KEY ("production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quotation_emails" ADD CONSTRAINT "vendor_quotation_emails_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quotation_emails" ADD CONSTRAINT "vendor_quotation_emails_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "pr_items_receipt_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "pr_items_po_item_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_items" ADD CONSTRAINT "installation_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transfer_items" ADD CONSTRAINT "material_transfer_items_material_code_materials_code_fk" FOREIGN KEY ("material_code") REFERENCES "public"."materials"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transfer_items" ADD CONSTRAINT "mat_transfer_items_transfer_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."material_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transfer_items" ADD CONSTRAINT "mat_transfer_items_from_pp_item_id_fk" FOREIGN KEY ("from_production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transfer_items" ADD CONSTRAINT "mat_transfer_items_to_pp_item_id_fk" FOREIGN KEY ("to_production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transfers" ADD CONSTRAINT "material_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transfer_items" ADD CONSTRAINT "prod_transfer_items_transfer_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."product_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transfer_items" ADD CONSTRAINT "prod_transfer_items_pp_item_id_fk" FOREIGN KEY ("production_plan_item_id") REFERENCES "public"."production_plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transfer_items" ADD CONSTRAINT "prod_transfer_items_to_order_item_id_fk" FOREIGN KEY ("to_order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_transfers" ADD CONSTRAINT "product_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boms_order_item_id_idx" ON "boms" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "boms_material_code_idx" ON "boms" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "boms_created_by_idx" ON "boms" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "material_category_subs_main_category_id_idx" ON "material_category_subs" USING btree ("main_category_id");--> statement-breakpoint
CREATE INDEX "product_category_subs_main_category_id_idx" ON "product_category_subs" USING btree ("main_category_id");--> statement-breakpoint
CREATE INDEX "cities_governorate_id_idx" ON "cities" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "cities_name_en_idx" ON "cities" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "cities_name_ar_idx" ON "cities" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "countries_name_en_idx" ON "countries" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "countries_name_ar_idx" ON "countries" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_city_id_idx" ON "customer_addresses" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_country_id_idx" ON "customer_addresses" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "customers_code_idx" ON "customers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "deliveries_code_idx" ON "deliveries" USING btree ("code");--> statement-breakpoint
CREATE INDEX "deliveries_order_id_idx" ON "deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "deliveries_scheduled_at_idx" ON "deliveries" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "deliveries_delivered_at_idx" ON "deliveries" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "deliveries_cancelled_at_idx" ON "deliveries" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "delivery_items_delivery_id_idx" ON "delivery_items" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_items_order_item_id_idx" ON "delivery_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "governorates_name_en_idx" ON "governorates" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "governorates_name_ar_idx" ON "governorates" USING btree ("name_ar");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_created_by_idx" ON "roles" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "users_code_idx" ON "users" USING btree ("code");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_name_idx" ON "users" USING btree ("name");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "vendor_addresses_vendor_id_idx" ON "vendor_addresses" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_addresses_city_id_idx" ON "vendor_addresses" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "vendor_addresses_country_id_idx" ON "vendor_addresses" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_addresses_one_default" ON "vendor_addresses" USING btree ("vendor_id") WHERE "vendor_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "vendors_code_idx" ON "vendors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vendors_phone_idx" ON "vendors" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "vendors_email_idx" ON "vendors" USING btree ("email");--> statement-breakpoint
CREATE INDEX "product_boms_product_code_idx" ON "product_boms" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "product_boms_material_code_idx" ON "product_boms" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "products_title_idx" ON "products" USING btree ("title");--> statement-breakpoint
CREATE INDEX "products_sub_category_id_idx" ON "products" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "materials_title_idx" ON "materials" USING btree ("title");--> statement-breakpoint
CREATE INDEX "materials_sub_category_id_idx" ON "materials" USING btree ("sub_category_id");--> statement-breakpoint
CREATE INDEX "inquiries_customer_id_idx" ON "inquiries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "inquiries_created_by_idx" ON "inquiries" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiry_items_inquiry_id_idx" ON "inquiry_items" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "inquiry_items_product_code_idx" ON "inquiry_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "preview_items_preview_id_idx" ON "preview_items" USING btree ("preview_id");--> statement-breakpoint
CREATE INDEX "preview_items_inquiry_item_id_idx" ON "preview_items" USING btree ("inquiry_item_id");--> statement-breakpoint
CREATE INDEX "previews_inquiry_id_idx" ON "previews" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "previews_scheduled_at_idx" ON "previews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "previews_completed_at_idx" ON "previews" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "previews_cancelled_at_idx" ON "previews" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "previews_assigned_to_idx" ON "previews" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "previews_created_by_idx" ON "previews" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "previews_created_at_idx" ON "previews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offer_items_offer_id_idx" ON "offer_items" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_items_inquiry_item_id_idx" ON "offer_items" USING btree ("inquiry_item_id");--> statement-breakpoint
CREATE INDEX "offer_items_product_code_idx" ON "offer_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "offers_inquiry_id_idx" ON "offers" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "offers_created_by_idx" ON "offers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offers_created_at_idx" ON "offers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_offer_item_id_idx" ON "order_items" USING btree ("offer_item_id");--> statement-breakpoint
CREATE INDEX "order_items_product_code_idx" ON "order_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "orders_code_idx" ON "orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "orders_inquiry_id_idx" ON "orders" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_time_idx" ON "orders" USING btree ("delivery_time");--> statement-breakpoint
CREATE INDEX "orders_completed_at_idx" ON "orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "orders_cancelled_at_idx" ON "orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_created_by_idx" ON "orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "production_plan_item_notes_plan_item_id_idx" ON "production_plan_item_notes" USING btree ("plan_item_id");--> statement-breakpoint
CREATE INDEX "production_plan_item_notes_created_by_idx" ON "production_plan_item_notes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "production_plan_items_plan_id_idx" ON "production_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "production_plan_items_order_item_id_idx" ON "production_plan_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "production_plans_code_idx" ON "production_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_plans_name_idx" ON "production_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "inventory_transaction_items_transaction_id_idx" ON "inventory_transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "inventory_transaction_items_material_code_idx" ON "inventory_transaction_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "inventory_transaction_items_product_code_idx" ON "inventory_transaction_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "inventory_transaction_items_purchase_receipt_item_id_idx" ON "inventory_transaction_items" USING btree ("purchase_receipt_item_id");--> statement-breakpoint
CREATE INDEX "inventory_transaction_items_production_plan_item_id_idx" ON "inventory_transaction_items" USING btree ("production_plan_item_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_code_idx" ON "inventory_transactions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inventory_transactions_transaction_type_idx" ON "inventory_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_by_idx" ON "inventory_transactions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_vendor_id_idx" ON "vendor_quotation_emails" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_created_by_idx" ON "vendor_quotation_emails" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "vendor_quotation_emails_status_idx" ON "vendor_quotation_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_material_code_idx" ON "purchase_order_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "purchase_order_items_product_code_idx" ON "purchase_order_items" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "purchase_order_items_bom_id_idx" ON "purchase_order_items" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_item_id_idx" ON "purchase_order_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_code_idx" ON "purchase_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_completed_at_idx" ON "purchase_orders" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "purchase_orders_cancelled_at_idx" ON "purchase_orders" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "purchase_orders_created_by_idx" ON "purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "purchase_orders_created_at_idx" ON "purchase_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "purchase_receipt_items_purchase_receipt_id_idx" ON "purchase_receipt_items" USING btree ("purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_items_purchase_order_item_id_idx" ON "purchase_receipt_items" USING btree ("purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_code_idx" ON "purchase_receipts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "purchase_receipts_purchase_order_id_idx" ON "purchase_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_received_at_idx" ON "purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "purchase_receipts_cancelled_at_idx" ON "purchase_receipts" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "purchase_receipts_received_by_idx" ON "purchase_receipts" USING btree ("received_by");--> statement-breakpoint
CREATE INDEX "purchase_receipts_created_by_idx" ON "purchase_receipts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "purchase_receipts_created_at_idx" ON "purchase_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "installation_items_installation_id_idx" ON "installation_items" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "installation_items_order_item_id_idx" ON "installation_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "installations_code_idx" ON "installations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "installations_order_id_idx" ON "installations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "installations_assigned_to_idx" ON "installations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "installations_scheduled_at_idx" ON "installations" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "installations_installed_at_idx" ON "installations" USING btree ("installed_at");--> statement-breakpoint
CREATE INDEX "installations_cancelled_at_idx" ON "installations" USING btree ("cancelled_at");--> statement-breakpoint
CREATE INDEX "material_transfer_items_transfer_id_idx" ON "material_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "material_transfer_items_material_code_idx" ON "material_transfer_items" USING btree ("material_code");--> statement-breakpoint
CREATE INDEX "material_transfer_items_from_pp_item_id_idx" ON "material_transfer_items" USING btree ("from_production_plan_item_id");--> statement-breakpoint
CREATE INDEX "material_transfer_items_to_pp_item_id_idx" ON "material_transfer_items" USING btree ("to_production_plan_item_id");--> statement-breakpoint
CREATE INDEX "material_transfers_code_idx" ON "material_transfers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "material_transfers_created_at_idx" ON "material_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "material_transfers_created_by_idx" ON "material_transfers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "product_transfer_items_transfer_id_idx" ON "product_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "product_transfer_items_pp_item_id_idx" ON "product_transfer_items" USING btree ("production_plan_item_id");--> statement-breakpoint
CREATE INDEX "product_transfer_items_to_order_item_id_idx" ON "product_transfer_items" USING btree ("to_order_item_id");--> statement-breakpoint
CREATE INDEX "product_transfers_code_idx" ON "product_transfers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "product_transfers_created_at_idx" ON "product_transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_transfers_created_by_idx" ON "product_transfers" USING btree ("created_by");