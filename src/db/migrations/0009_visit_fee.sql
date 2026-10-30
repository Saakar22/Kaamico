ALTER TABLE "bookings" ADD COLUMN "visit_fee_paise" integer;--> statement-breakpoint
-- Late cancellations so far only recorded the fee in their history: make those payable too.
UPDATE "bookings" b SET "visit_fee_paise" = (h."metadata"->>'visitFeePaise')::int
FROM "booking_status_history" h
WHERE h."booking_id" = b."id" AND h."to_status" = 'CANCELLED' AND b."status" = 'CANCELLED'
  AND (h."metadata"->>'visitFeePaise')::int > 0;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_visit_fee_on_cancel" CHECK ("bookings"."visit_fee_paise" is null or ("bookings"."visit_fee_paise" > 0 and "bookings"."status" = 'CANCELLED'));
