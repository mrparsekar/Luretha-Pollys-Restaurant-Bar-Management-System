DELETE FROM "daily_specials" WHERE "menu_item_id" IS NULL;--> statement-breakpoint
ALTER TABLE "daily_specials" ALTER COLUMN "menu_item_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_specials_menu_item_unique" ON "daily_specials" USING btree ("menu_item_id");--> statement-breakpoint
ALTER TABLE "daily_specials" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "daily_specials" DROP COLUMN "custom_name";--> statement-breakpoint
ALTER TABLE "daily_specials" DROP COLUMN "custom_description";--> statement-breakpoint
ALTER TABLE "daily_specials" DROP COLUMN "custom_price_paise";--> statement-breakpoint
DROP TYPE "public"."special_source";