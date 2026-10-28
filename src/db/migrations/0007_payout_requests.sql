ALTER TABLE "payouts" ADD COLUMN "failure_reason" varchar(300);--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_one_open_per_worker" ON "payouts" USING btree ("worker_id") WHERE "payouts"."status" in ('REQUESTED', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "payouts_queue_idx" ON "payouts" USING btree ("status","requested_at");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paid_at" CHECK ("payouts"."status" <> 'PAID' or "payouts"."paid_at" is not null);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_failure_reason" CHECK ("payouts"."status" <> 'FAILED' or "payouts"."failure_reason" is not null);