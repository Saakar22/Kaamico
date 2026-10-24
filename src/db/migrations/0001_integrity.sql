-- Integrity rules Drizzle cannot express (IMPLEMENTATION_PLAN.md §9.4).
-- Error codes: 23001 restrict_violation = immutable/append-only data,
--              23514 check_violation    = business eligibility rule.

-- Great-circle distance in kilometres (straight line, not road distance).
CREATE OR REPLACE FUNCTION kaamico_haversine_km(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;
--> statement-breakpoint

-- A worker can never hold two active bookings with overlapping slots.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_worker_overlap
  EXCLUDE USING gist (worker_id WITH =, slot WITH &&)
  WHERE (status IN ('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'));
--> statement-breakpoint

ALTER TABLE worker_availability_rules ADD CONSTRAINT worker_availability_rules_no_overlap
  EXCLUDE USING gist (worker_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&);
--> statement-breakpoint

ALTER TABLE worker_time_off ADD CONSTRAINT worker_time_off_no_overlap
  EXCLUDE USING gist (worker_id WITH =, period WITH &&);
--> statement-breakpoint

-- Append-only tables: rows may be inserted, never updated or deleted.
CREATE OR REPLACE FUNCTION kaamico_forbid_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: rows are append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint

CREATE TRIGGER booking_status_history_append_only BEFORE UPDATE OR DELETE ON booking_status_history
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER negotiation_messages_append_only BEFORE UPDATE OR DELETE ON negotiation_messages
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER worker_ledger_entries_append_only BEFORE UPDATE OR DELETE ON worker_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER admin_audit_logs_append_only BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER bookings_no_delete BEFORE DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION kaamico_forbid_modification();
--> statement-breakpoint

-- Bookings: identity never changes; once agreed, the price, offer, worker and
-- commission are locked. Extra amounts only arrive via approved booking_charges.
CREATE OR REPLACE FUNCTION kaamico_bookings_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps THEN
    RAISE EXCEPTION 'booking % identity columns are immutable', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.agreed_price_paise IS NOT NULL AND NEW.agreed_price_paise IS DISTINCT FROM OLD.agreed_price_paise THEN
    RAISE EXCEPTION 'booking % agreed price is locked', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.accepted_offer_id IS NOT NULL AND NEW.accepted_offer_id IS DISTINCT FROM OLD.accepted_offer_id THEN
    RAISE EXCEPTION 'booking % accepted offer is locked', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.worker_id IS NOT NULL AND NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    RAISE EXCEPTION 'booking % assigned worker cannot change', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_guard BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION kaamico_bookings_guard();
--> statement-breakpoint

-- Price offers: terms are immutable; status can only move away from PENDING once.
CREATE OR REPLACE FUNCTION kaamico_price_offers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'price offers cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.offered_by IS DISTINCT FROM OLD.offered_by
     OR NEW.amount_paise IS DISTINCT FROM OLD.amount_paise
     OR NEW.round IS DISTINCT FROM OLD.round
     OR NEW.parent_offer_id IS DISTINCT FROM OLD.parent_offer_id
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'price offer % terms are immutable', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'PENDING' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'price offer % is already %', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER price_offers_guard BEFORE UPDATE OR DELETE ON price_offers
  FOR EACH ROW EXECUTE FUNCTION kaamico_price_offers_guard();
--> statement-breakpoint

-- Reviews: only the booking's customer, for its assigned worker, after completion,
-- within 14 days. The parties of a review never change.
CREATE OR REPLACE FUNCTION kaamico_reviews_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'review % parties are immutable', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status, customer_id, worker_id, completed_at INTO b FROM bookings WHERE id = NEW.booking_id;
  IF b.status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'only completed bookings can be reviewed' USING ERRCODE = 'check_violation';
  END IF;
  IF b.customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'only the booking customer can review it' USING ERRCODE = 'check_violation';
  END IF;
  IF b.worker_id <> NEW.worker_id THEN
    RAISE EXCEPTION 'a review must be for the assigned worker' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_at > b.completed_at + interval '14 days' THEN
    RAISE EXCEPTION 'the review window (14 days) has closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_guard BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION kaamico_reviews_guard();
--> statement-breakpoint

-- Pricing: a worker can only price services in categories they have a skill in.
CREATE OR REPLACE FUNCTION kaamico_pricing_skill_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active AND NOT EXISTS (
    SELECT 1 FROM worker_skills ws JOIN services s ON s.category_id = ws.category_id
    WHERE ws.worker_id = NEW.worker_id AND s.id = NEW.service_id
  ) THEN
    RAISE EXCEPTION 'worker % has no skill in the category of service %', NEW.worker_id, NEW.service_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER worker_service_pricing_skill_guard BEFORE INSERT OR UPDATE ON worker_service_pricing
  FOR EACH ROW EXECUTE FUNCTION kaamico_pricing_skill_guard();
--> statement-breakpoint

-- Refunds: the total of non-failed refunds can never exceed the payment amount.
-- Locks the payment row so concurrent refunds are serialised.
CREATE OR REPLACE FUNCTION kaamico_refunds_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  paid integer;
  refunded integer;
BEGIN
  IF NEW.status = 'FAILED' THEN
    RETURN NEW;
  END IF;
  SELECT amount_paise INTO paid FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT coalesce(sum(amount_paise), 0) INTO refunded
    FROM refunds WHERE payment_id = NEW.payment_id AND status <> 'FAILED' AND id <> NEW.id;
  IF refunded + NEW.amount_paise > paid THEN
    RAISE EXCEPTION 'refunds (% + %) would exceed the payment amount %', refunded, NEW.amount_paise, paid
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER refunds_cap BEFORE INSERT OR UPDATE OF amount_paise, status ON refunds
  FOR EACH ROW EXECUTE FUNCTION kaamico_refunds_cap();
