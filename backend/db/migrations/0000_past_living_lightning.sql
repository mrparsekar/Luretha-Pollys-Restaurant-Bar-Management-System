CREATE TYPE "public"."delivery_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'opened', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('none', 'amount', 'percent');--> statement-breakpoint
CREATE TYPE "public"."menu_group" AS ENUM('breakfast', 'food', 'bar', 'beverage', 'dessert');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('placed', 'served', 'void');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('open', 'billed', 'settled', 'void');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('dine_in', 'takeaway');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'upi');--> statement-breakpoint
CREATE TYPE "public"."price_mode" AS ENUM('fixed', 'variant', 'ask');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'waiter');--> statement-breakpoint
CREATE TYPE "public"."table_section" AS ENUM('indoor', 'garden', 'beach');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"target" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group" "menu_group" NOT NULL,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_counters" (
	"business_date" date PRIMARY KEY NOT NULL,
	"last_order_no" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"section" "table_section" DEFAULT 'indoor' NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"label" text NOT NULL,
	"price_paise" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_mode" "price_mode" DEFAULT 'fixed' NOT NULL,
	"base_price_paise" integer,
	"is_veg" boolean,
	"available" boolean DEFAULT true NOT NULL,
	"avail_from" time,
	"avail_to" time,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"round_no" integer DEFAULT 1 NOT NULL,
	"menu_item_id" integer,
	"variant_id" integer,
	"name_snapshot" text NOT NULL,
	"variant_snapshot" text,
	"category_snapshot" text NOT NULL,
	"group_snapshot" "menu_group" NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"note" text,
	"status" "order_item_status" DEFAULT 'placed' NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"served_at" timestamp with time zone,
	"voided_by_id" integer,
	"voided_at" timestamp with time zone,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" integer NOT NULL,
	"business_date" date NOT NULL,
	"order_type" "order_type" DEFAULT 'dine_in' NOT NULL,
	"dining_table_id" integer,
	"waiter_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'open' NOT NULL,
	"guests" integer DEFAULT 0 NOT NULL,
	"guest_name" text,
	"guest_phone" text,
	"guest_email" text,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"discount_type" "discount_type" DEFAULT 'none' NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"service_charge_paise" integer DEFAULT 0 NOT NULL,
	"round_off_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"payment_mode" "payment_mode",
	"notes" text,
	"bill_token" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_item_at" timestamp with time zone,
	"billed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"settled_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"restaurant_name" text NOT NULL,
	"tagline" text,
	"address" text,
	"phone_primary" text,
	"phone_secondary" text,
	"instagram" text,
	"upi_id" text,
	"upi_payee_name" text,
	"review_url" text,
	"bill_footer" text,
	"tax_enabled" boolean DEFAULT false NOT NULL,
	"food_tax_bps" integer DEFAULT 0 NOT NULL,
	"liquor_tax_bps" integer DEFAULT 0 NOT NULL,
	"service_charge_bps" integer DEFAULT 0 NOT NULL,
	"business_day_start_hour" integer DEFAULT 6 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"email" text,
	"password_hash" text,
	"pin_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_deliveries" ADD CONSTRAINT "bill_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_voided_by_id_staff_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_dining_table_id_dining_tables_id_fk" FOREIGN KEY ("dining_table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_staff_id_fk" FOREIGN KEY ("waiter_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_settled_by_id_staff_id_fk" FOREIGN KEY ("settled_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bill_deliveries_order_idx" ON "bill_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_label_unique" ON "dining_tables" USING btree ("label");--> statement-breakpoint
CREATE INDEX "item_variants_item_idx" ON "item_variants" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_created_at_idx" ON "order_items" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_day_no_unique" ON "orders" USING btree ("business_date","order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_bill_token_unique" ON "orders" USING btree ("bill_token");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_business_date_idx" ON "orders" USING btree ("business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_unique" ON "staff" USING btree ("email");