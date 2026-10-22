DROP INDEX "products_title_idx";--> statement-breakpoint
DROP INDEX "materials_title_idx";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_title_unique" UNIQUE("title");--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_title_unique" UNIQUE("title");