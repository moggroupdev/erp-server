ALTER TABLE "inventory_transaction_items" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ADD COLUMN IF NOT EXISTS "unit_of_measurement_selected" "material_unit";--> statement-breakpoint
UPDATE "inventory_transaction_items" AS iti SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "materials" AS m WHERE iti."material_code" = m."code" AND iti."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
UPDATE "material_purchase_order_items" AS mpoi SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "materials" AS m WHERE mpoi."material_code" = m."code" AND mpoi."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
UPDATE "material_purchase_receipt_items" AS mpri SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "material_purchase_order_items" AS mpoi INNER JOIN "materials" AS m ON m."code" = mpoi."material_code" WHERE mpri."material_purchase_order_item_id" = mpoi."id" AND mpri."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
UPDATE "outsourcing_order_items" AS osoi SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "materials" AS m WHERE osoi."manufactured_material_code" = m."code" AND osoi."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
UPDATE "outsourcing_receipt_items" AS osri SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "outsourcing_order_items" AS osoi INNER JOIN "materials" AS m ON m."code" = osoi."manufactured_material_code" WHERE osri."outsourcing_order_item_id" = osoi."id" AND osri."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
UPDATE "maintenance_order_materials" AS mom SET "unit_of_measurement_selected" = m."unit_of_measurement" FROM "materials" AS m WHERE mom."material_code" = m."code" AND mom."unit_of_measurement_selected" IS NULL;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_order_items" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "material_purchase_receipt_items" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_receipt_items" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_order_materials" ALTER COLUMN "unit_of_measurement_selected" SET NOT NULL;
