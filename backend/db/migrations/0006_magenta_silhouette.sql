DROP INDEX "daily_specials_menu_item_unique";--> statement-breakpoint
ALTER TABLE "daily_specials" ADD COLUMN "days_of_week" integer[];--> statement-breakpoint
ALTER TABLE "daily_specials" ADD COLUMN "removed_at" timestamp with time zone;