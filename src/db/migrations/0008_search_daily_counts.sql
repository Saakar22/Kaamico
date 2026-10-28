CREATE TABLE "search_daily_counts" (
	"day" date NOT NULL,
	"service_id" uuid NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL,
	"empty_results" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_daily_counts_day_service_id_pk" PRIMARY KEY("day","service_id"),
	CONSTRAINT "search_daily_counts_valid" CHECK ("search_daily_counts"."empty_results" between 0 and "search_daily_counts"."searches")
);
--> statement-breakpoint
ALTER TABLE "search_daily_counts" ADD CONSTRAINT "search_daily_counts_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;