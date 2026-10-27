ALTER TABLE "reviews" ADD COLUMN "flag_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "flagged_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_flagged_by_user_id_users_id_fk" FOREIGN KEY ("flagged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;