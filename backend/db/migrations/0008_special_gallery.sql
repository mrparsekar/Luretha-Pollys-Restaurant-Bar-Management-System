CREATE TABLE "special_gallery_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_data" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
