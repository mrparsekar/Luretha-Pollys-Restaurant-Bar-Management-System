CREATE TYPE "public"."special_source" AS ENUM('menu_item', 'custom');--> statement-breakpoint
CREATE TABLE "daily_specials" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "special_source" NOT NULL,
	"menu_item_id" integer,
	"custom_name" text,
	"custom_description" text,
	"custom_price_paise" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_specials" ADD CONSTRAINT "daily_specials_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;