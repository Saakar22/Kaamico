CREATE TABLE "customer_ratings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"tags" varchar(24)[] DEFAULT '{}' NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_ratings_bookingId_unique" UNIQUE("booking_id"),
	CONSTRAINT "customer_ratings_rating_range" CHECK ("customer_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_ratings" ADD CONSTRAINT "customer_ratings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ratings" ADD CONSTRAINT "customer_ratings_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ratings" ADD CONSTRAINT "customer_ratings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_ratings_customer_idx" ON "customer_ratings" USING btree ("customer_id");--> statement-breakpoint
-- Customer ratings: only the booking's assigned professional, for its customer, after
-- completion, within 14 days. Ratings never change once given.
CREATE OR REPLACE FUNCTION kaamico_customer_ratings_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'customer rating % cannot change', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT status, customer_id, worker_id, completed_at INTO b FROM bookings WHERE id = NEW.booking_id;
  IF b.status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'only completed bookings can be rated' USING ERRCODE = 'check_violation';
  END IF;
  IF b.worker_id <> NEW.worker_id THEN
    RAISE EXCEPTION 'only the assigned professional can rate the customer' USING ERRCODE = 'check_violation';
  END IF;
  IF b.customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'a rating must be for the booking customer' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_at > b.completed_at + interval '14 days' THEN
    RAISE EXCEPTION 'the rating window (14 days) has closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER customer_ratings_guard BEFORE INSERT OR UPDATE ON customer_ratings
  FOR EACH ROW EXECUTE FUNCTION kaamico_customer_ratings_guard();
