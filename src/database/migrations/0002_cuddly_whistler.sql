ALTER TABLE "preview_items" DROP CONSTRAINT "preview_items_inquiry_item_id_inquiry_items_id_fk";
--> statement-breakpoint
DROP INDEX "preview_items_inquiry_item_id_idx";--> statement-breakpoint
ALTER TABLE "preview_items" ADD COLUMN "product_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "preview_items" ADD CONSTRAINT "preview_items_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preview_items_product_code_idx" ON "preview_items" USING btree ("product_code");--> statement-breakpoint
ALTER TABLE "preview_items" DROP COLUMN "inquiry_item_id";