CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"city" varchar(80) NOT NULL,
	"city_key" varchar(80) NOT NULL,
	"contact" varchar(120) NOT NULL,
	"contact_kind" varchar(8) NOT NULL,
	"category_id" uuid,
	"approx_lat" double precision,
	"approx_lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_contact_city" UNIQUE("contact","city_key"),
	CONSTRAINT "waitlist_entries_contact_kind" CHECK ("waitlist_entries"."contact_kind" in ('PHONE', 'EMAIL'))
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entries_city_idx" ON "waitlist_entries" USING btree ("city_key");