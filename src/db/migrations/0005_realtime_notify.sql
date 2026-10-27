-- Live updates (IMPLEMENTATION_PLAN.md §13, SSE): changes that someone should see at once
-- are announced on the `kmc_events` channel with the user ids they concern. NOTIFY is
-- transactional, so listeners only hear about committed changes. Payloads carry ids only.

CREATE OR REPLACE FUNCTION kaamico_announce_booking(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  recipients uuid[];
BEGIN
  SELECT array_agg(DISTINCT u) INTO recipients FROM (
    SELECT customer_id AS u FROM bookings WHERE id = p_booking_id
    UNION
    SELECT w.user_id FROM booking_invitations i
      JOIN worker_profiles w ON w.id = i.worker_id
      WHERE i.booking_id = p_booking_id
  ) parties;
  IF recipients IS NOT NULL THEN
    PERFORM pg_notify(
      'kmc_events',
      json_build_object('type', 'booking', 'bookingId', p_booking_id, 'users', recipients)::text
    );
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kaamico_announce_booking_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM kaamico_announce_booking(NEW.booking_id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kaamico_announce_booking_self() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM kaamico_announce_booking(NEW.id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kaamico_announce_notification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'kmc_events',
    json_build_object('type', 'notification', 'users', json_build_array(NEW.user_id))::text
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_announce AFTER UPDATE ON bookings
  FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION kaamico_announce_booking_self();
--> statement-breakpoint
CREATE TRIGGER booking_invitations_announce AFTER INSERT OR UPDATE ON booking_invitations
  FOR EACH ROW EXECUTE FUNCTION kaamico_announce_booking_row();
--> statement-breakpoint
CREATE TRIGGER price_offers_announce AFTER INSERT OR UPDATE ON price_offers
  FOR EACH ROW EXECUTE FUNCTION kaamico_announce_booking_row();
--> statement-breakpoint
CREATE TRIGGER negotiation_messages_announce AFTER INSERT ON negotiation_messages
  FOR EACH ROW EXECUTE FUNCTION kaamico_announce_booking_row();
--> statement-breakpoint
CREATE TRIGGER booking_charges_announce AFTER INSERT OR UPDATE ON booking_charges
  FOR EACH ROW EXECUTE FUNCTION kaamico_announce_booking_row();
--> statement-breakpoint
CREATE TRIGGER notifications_announce AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION kaamico_announce_notification();
