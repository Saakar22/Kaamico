CREATE TYPE "public"."actor_role" AS ENUM('CUSTOMER', 'WORKER', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."address_label" AS ENUM('HOME', 'WORK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."booking_mode" AS ENUM('DIRECT', 'BROADCAST');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('REQUESTED', 'NEGOTIATING', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."booking_timing" AS ENUM('ON_DEMAND', 'SCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."charge_kind" AS ENUM('MATERIALS', 'EXTRA_WORK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('PROPOSED', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."dispute_outcome" AS ENUM('CUSTOMER_FAVOUR', 'WORKER_FAVOUR', 'SPLIT', 'NO_ACTION');--> statement-breakpoint
CREATE TYPE "public"."dispute_reason" AS ENUM('NO_SHOW', 'POOR_QUALITY', 'OVERCHARGE', 'DAMAGE', 'SAFETY', 'PAYMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('INVITED', 'SEEN', 'QUOTED', 'DECLINED', 'EXPIRED', 'WON', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('JOB_EARNING', 'COMMISSION', 'CASH_COLLECTED', 'ADJUSTMENT', 'REFUND_CLAWBACK', 'PAYOUT');--> statement-breakpoint
CREATE TYPE "public"."offer_party" AS ENUM('CUSTOMER', 'WORKER');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('CASH', 'SIMULATED', 'RAZORPAY');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payout_mode" AS ENUM('SIMULATED', 'BANK', 'UPI');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('REQUESTED', 'PROCESSING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."pricing_unit" AS ENUM('PER_VISIT', 'PER_HOUR', 'PER_ITEM', 'PER_SQFT', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('PUBLISHED', 'HIDDEN', 'FLAGGED');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CUSTOMER', 'WORKER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."verification_application_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."verification_document_type" AS ENUM('AADHAAR_MASKED', 'PAN', 'VOTER_ID', 'DRIVING_LICENCE', 'SELFIE', 'SKILL_CERTIFICATE', 'POLICE_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."worker_verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" "address_label" DEFAULT 'HOME' NOT NULL,
	"line1" varchar(120) NOT NULL,
	"line2" varchar(120),
	"landmark" varchar(120),
	"locality_id" uuid,
	"city" varchar(60) NOT NULL,
	"state" varchar(60) NOT NULL,
	"pincode" char(6) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "addresses_pincode_format" CHECK ("addresses"."pincode" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "addresses_in_india" CHECK ("addresses"."lat" between 6 and 37 and "addresses"."lng" between 68 and 98)
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_address_id" uuid,
	"bookings_count" integer DEFAULT 0 NOT NULL,
	"cancellations_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"city" varchar(60) NOT NULL,
	"name" varchar(80) NOT NULL,
	"pincode" char(6),
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_serviceable" boolean DEFAULT true NOT NULL,
	CONSTRAINT "localities_city_name_key" UNIQUE("city","name"),
	CONSTRAINT "localities_in_india" CHECK ("localities"."lat" between 6 and 37 and "localities"."lng" between 68 and 98)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"phone" varchar(13),
	"phone_verified_at" timestamp with time zone,
	"email" "citext",
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" varchar(80),
	"roles" "user_role"[] DEFAULT '{CUSTOMER}' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"preferred_locale" varchar(8) DEFAULT 'en' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_contact_present" CHECK ("users"."phone" is not null or "users"."email" is not null),
	CONSTRAINT "users_phone_format" CHECK ("users"."phone" ~ '^\+91[6-9][0-9]{9}$'),
	CONSTRAINT "users_roles_not_empty" CHECK (cardinality("users"."roles") > 0)
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(300),
	"icon_key" varchar(40) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"pricing_unit" "pricing_unit" NOT NULL,
	"typical_duration_min" smallint NOT NULL,
	"reference_min_paise" integer,
	"reference_max_paise" integer,
	"search_terms" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(search_terms, ''))) STORED,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_category_slug_key" UNIQUE("category_id","slug"),
	CONSTRAINT "services_duration_positive" CHECK ("services"."typical_duration_min" between 15 and 1440),
	CONSTRAINT "services_reference_range" CHECK ("services"."reference_min_paise" is null or "services"."reference_max_paise" is null or "services"."reference_min_paise" <= "services"."reference_max_paise")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"customer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_customer_id_worker_id_pk" PRIMARY KEY("customer_id","worker_id")
);
--> statement-breakpoint
CREATE TABLE "worker_availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"worker_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "worker_availability_rules_weekday" CHECK ("worker_availability_rules"."weekday" between 0 and 6),
	CONSTRAINT "worker_availability_rules_window" CHECK ("worker_availability_rules"."start_minute" >= 0 and "worker_availability_rules"."start_minute" < "worker_availability_rules"."end_minute" and "worker_availability_rules"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "worker_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"bio" varchar(600),
	"photo_key" text,
	"years_experience" smallint DEFAULT 0 NOT NULL,
	"languages" varchar(8)[] DEFAULT '{}' NOT NULL,
	"verification_status" "worker_verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"online_since" timestamp with time zone,
	"paused_until" timestamp with time zone,
	"base_lat" double precision,
	"base_lng" double precision,
	"base_locality_id" uuid,
	"service_radius_km" numeric(4, 1) DEFAULT 5 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"accepted_invitations" integer DEFAULT 0 NOT NULL,
	"total_invitations" integer DEFAULT 0 NOT NULL,
	"cancellations_by_worker" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_profiles_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "worker_profiles_radius" CHECK ("worker_profiles"."service_radius_km" between 1 and 25),
	CONSTRAINT "worker_profiles_base_in_india" CHECK (("worker_profiles"."base_lat" is null and "worker_profiles"."base_lng" is null) or ("worker_profiles"."base_lat" between 6 and 37 and "worker_profiles"."base_lng" between 68 and 98)),
	CONSTRAINT "worker_profiles_experience" CHECK ("worker_profiles"."years_experience" between 0 and 60),
	CONSTRAINT "worker_profiles_counters" CHECK ("worker_profiles"."rating_sum" >= 0 and "worker_profiles"."rating_count" >= 0 and "worker_profiles"."completed_jobs" >= 0 and "worker_profiles"."rating_sum" <= "worker_profiles"."rating_count" * 5)
);
--> statement-breakpoint
CREATE TABLE "worker_service_pricing" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"worker_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"price_paise" integer NOT NULL,
	"min_charge_paise" integer NOT NULL,
	"unit" "pricing_unit" NOT NULL,
	"is_negotiable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_service_pricing_worker_service_key" UNIQUE("worker_id","service_id"),
	CONSTRAINT "worker_service_pricing_price_range" CHECK ("worker_service_pricing"."price_paise" between 5000 and 10000000),
	CONSTRAINT "worker_service_pricing_min_charge" CHECK ("worker_service_pricing"."min_charge_paise" >= 0 and "worker_service_pricing"."min_charge_paise" <= "worker_service_pricing"."price_paise" * 3)
);
--> statement-breakpoint
CREATE TABLE "worker_skills" (
	"worker_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"years_experience" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_skills_worker_id_category_id_pk" PRIMARY KEY("worker_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "worker_time_off" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"worker_id" uuid NOT NULL,
	"period" "tstzrange" NOT NULL,
	"reason" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_time_off_not_empty" CHECK (not isempty("worker_time_off"."period"))
);
--> statement-breakpoint
CREATE TABLE "booking_charges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"proposed_by_worker_id" uuid NOT NULL,
	"kind" charge_kind NOT NULL,
	"description" varchar(200) NOT NULL,
	"amount_paise" integer NOT NULL,
	"receipt_key" text,
	"status" charge_status DEFAULT 'PROPOSED' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_charges_amount" CHECK ("booking_charges"."amount_paise" between 1 and 5000000)
);
--> statement-breakpoint
CREATE TABLE "booking_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'INVITED' NOT NULL,
	"distance_km" numeric(5, 2) NOT NULL,
	"rank_score" numeric(6, 4),
	"expires_at" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_invitations_booking_worker_key" UNIQUE("booking_id","worker_id"),
	CONSTRAINT "booking_invitations_distance" CHECK ("booking_invitations"."distance_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" varchar(300),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" varchar(12) NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"worker_id" uuid,
	"mode" "booking_mode" DEFAULT 'DIRECT' NOT NULL,
	"timing" "booking_timing" NOT NULL,
	"status" "booking_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_start" timestamp with time zone NOT NULL,
	"slot" "tstzrange",
	"address_id" uuid,
	"address_snapshot" jsonb NOT NULL,
	"job_lat" double precision NOT NULL,
	"job_lng" double precision NOT NULL,
	"locality_label" varchar(120) NOT NULL,
	"description" varchar(1000),
	"customer_initial_offer_paise" integer,
	"listed_price_paise" integer,
	"agreed_price_paise" integer,
	"accepted_offer_id" uuid,
	"approved_charges_paise" integer DEFAULT 0 NOT NULL,
	"final_amount_paise" integer GENERATED ALWAYS AS (agreed_price_paise + approved_charges_paise) STORED,
	"commission_bps" integer NOT NULL,
	"start_code_hash" text,
	"start_code_attempts" smallint DEFAULT 0 NOT NULL,
	"cancelled_by" "actor_role",
	"cancellation_reason" varchar(300),
	"idempotency_key" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_code_unique" UNIQUE("code"),
	CONSTRAINT "bookings_acceptedOfferId_unique" UNIQUE("accepted_offer_id"),
	CONSTRAINT "bookings_customer_idempotency_key" UNIQUE("customer_id","idempotency_key"),
	CONSTRAINT "bookings_job_in_india" CHECK ("bookings"."job_lat" between 6 and 37 and "bookings"."job_lng" between 68 and 98),
	CONSTRAINT "bookings_amounts_positive" CHECK (coalesce("bookings"."agreed_price_paise", 1) > 0 and coalesce("bookings"."customer_initial_offer_paise", 1) > 0 and coalesce("bookings"."listed_price_paise", 1) > 0 and "bookings"."approved_charges_paise" >= 0),
	CONSTRAINT "bookings_commission_range" CHECK ("bookings"."commission_bps" between 0 and 5000),
	CONSTRAINT "bookings_start_code_attempts" CHECK ("bookings"."start_code_attempts" between 0 and 5),
	CONSTRAINT "bookings_priced_when_confirmed" CHECK ("bookings"."status" not in ('CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED','DISPUTED') or ("bookings"."worker_id" is not null and "bookings"."agreed_price_paise" is not null and "bookings"."accepted_offer_id" is not null and "bookings"."slot" is not null and "bookings"."confirmed_at" is not null)),
	CONSTRAINT "bookings_completed_at" CHECK ("bookings"."status" <> 'COMPLETED' or "bookings"."completed_at" is not null),
	CONSTRAINT "bookings_cancellation_recorded" CHECK ("bookings"."status" <> 'CANCELLED' or ("bookings"."cancelled_at" is not null and "bookings"."cancelled_by" is not null)),
	CONSTRAINT "bookings_slot_not_empty" CHECK ("bookings"."slot" is null or not isempty("bookings"."slot"))
);
--> statement-breakpoint
CREATE TABLE "negotiation_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"body" varchar(500) NOT NULL,
	"offer_id" uuid,
	"redacted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiation_messages_body_not_blank" CHECK (length(trim("negotiation_messages"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "price_offers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"offered_by" "offer_party" NOT NULL,
	"amount_paise" integer NOT NULL,
	"note" varchar(200),
	"status" "offer_status" DEFAULT 'PENDING' NOT NULL,
	"parent_offer_id" uuid,
	"round" smallint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_offers_amount_positive" CHECK ("price_offers"."amount_paise" > 0),
	CONSTRAINT "price_offers_round" CHECK ("price_offers"."round" between 1 and 6)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"number" varchar(24) NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"platform_fee_paise" integer NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_bookingId_unique" UNIQUE("booking_id"),
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_amounts" CHECK ("invoices"."subtotal_paise" >= 0 and "invoices"."platform_fee_paise" >= 0 and "invoices"."tax_paise" >= 0 and "invoices"."total_paise" = "invoices"."subtotal_paise" + "invoices"."tax_paise")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" varchar(120) NOT NULL,
	"type" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_events_provider_event_key" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"provider_order_id" varchar(80),
	"provider_payment_id" varchar(80),
	"idempotency_key" uuid NOT NULL,
	"failure_reason" varchar(300),
	"captured_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_providerOrderId_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_providerPaymentId_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_payer_idempotency_key" UNIQUE("payer_user_id","idempotency_key"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paise" > 0),
	CONSTRAINT "payments_captured_at" CHECK ("payments"."status" <> 'CAPTURED' or "payments"."captured_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"worker_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "payout_status" DEFAULT 'REQUESTED' NOT NULL,
	"mode" "payout_mode" DEFAULT 'SIMULATED' NOT NULL,
	"reference" varchar(80),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" varchar(300) NOT NULL,
	"status" "refund_status" DEFAULT 'REQUESTED' NOT NULL,
	"provider_refund_id" varchar(80),
	"initiated_by_admin_id" uuid NOT NULL,
	"dispute_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_providerRefundId_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "worker_ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "worker_ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"worker_id" uuid NOT NULL,
	"booking_id" uuid,
	"payout_id" uuid,
	"type" "ledger_entry_type" NOT NULL,
	"amount_paise" integer NOT NULL,
	"description" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_ledger_entries_nonzero" CHECK ("worker_ledger_entries"."amount_paise" <> 0),
	CONSTRAINT "worker_ledger_entries_sign" CHECK (("worker_ledger_entries"."type" = 'JOB_EARNING' and "worker_ledger_entries"."amount_paise" > 0)
        or ("worker_ledger_entries"."type" in ('COMMISSION', 'CASH_COLLECTED', 'REFUND_CLAWBACK', 'PAYOUT') and "worker_ledger_entries"."amount_paise" < 0)
        or "worker_ledger_entries"."type" = 'ADJUSTMENT'),
	CONSTRAINT "worker_ledger_entries_booking_required" CHECK ("worker_ledger_entries"."type" not in ('JOB_EARNING', 'COMMISSION', 'CASH_COLLECTED') or "worker_ledger_entries"."booking_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"storage_key" text,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_evidence_content" CHECK ("dispute_evidence"."storage_key" is not null or "dispute_evidence"."note" is not null)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"raised_by_user_id" uuid NOT NULL,
	"raised_by_role" "actor_role" NOT NULL,
	"reason" "dispute_reason" NOT NULL,
	"description" varchar(2000) NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"outcome" "dispute_outcome",
	"resolution_note" varchar(2000),
	"resolved_by_admin_id" uuid,
	"resolved_at" timestamp with time zone,
	"previous_booking_status" "booking_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_resolution_recorded" CHECK ("disputes"."status" not in ('RESOLVED', 'REJECTED') or ("disputes"."resolved_by_admin_id" is not null and "disputes"."resolved_at" is not null and "disputes"."resolution_note" is not null))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"tags" varchar(24)[] DEFAULT '{}' NOT NULL,
	"comment" varchar(1000),
	"status" "review_status" DEFAULT 'PUBLISHED' NOT NULL,
	"worker_reply" varchar(500),
	"reply_at" timestamp with time zone,
	"hidden_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_bookingId_unique" UNIQUE("booking_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"booking_id" uuid,
	"category" varchar(40) NOT NULL,
	"subject" varchar(150) NOT NULL,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"body" varchar(4000) NOT NULL,
	"attachment_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_applications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"worker_id" uuid NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"status" "verification_application_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewer_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_reason" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_applications_reason_required" CHECK ("verification_applications"."status" not in ('REJECTED', 'RESUBMISSION_REQUESTED') or length(coalesce("verification_applications"."decision_reason", '')) >= 10)
);
--> statement-breakpoint
CREATE TABLE "verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"application_id" uuid NOT NULL,
	"doc_type" "verification_document_type" NOT NULL,
	"id_last4" char(4),
	"storage_key" text NOT NULL,
	"mime_type" varchar(60) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "verification_documents_last4" CHECK ("verification_documents"."id_last4" is null or "verification_documents"."id_last4" ~ '^[0-9A-Z]{4}$'),
	CONSTRAINT "verification_documents_size" CHECK ("verification_documents"."size_bytes" between 1 and 8388608)
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"admin_user_id" uuid NOT NULL,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" varchar(500),
	"ip" "inet",
	"user_agent" varchar(300),
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"route" varchar(120) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status_code" smallint,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" varchar(500),
	"link" varchar(300),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" varchar(160) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(60) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "uploads_size" CHECK ("uploads"."size_bytes" between 1 and 8388608)
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_address_id_addresses_id_fk" FOREIGN KEY ("default_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_availability_rules" ADD CONSTRAINT "worker_availability_rules_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_base_locality_id_localities_id_fk" FOREIGN KEY ("base_locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_service_pricing" ADD CONSTRAINT "worker_service_pricing_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_service_pricing" ADD CONSTRAINT "worker_service_pricing_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_skills" ADD CONSTRAINT "worker_skills_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_skills" ADD CONSTRAINT "worker_skills_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_time_off" ADD CONSTRAINT "worker_time_off_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_proposed_by_worker_id_worker_profiles_id_fk" FOREIGN KEY ("proposed_by_worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invitations" ADD CONSTRAINT "booking_invitations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invitations" ADD CONSTRAINT "booking_invitations_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_accepted_offer_id_price_offers_id_fk" FOREIGN KEY ("accepted_offer_id") REFERENCES "public"."price_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_offer_id_price_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."price_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_invitation_id_booking_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."booking_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_parent_offer_id_price_offers_id_fk" FOREIGN KEY ("parent_offer_id") REFERENCES "public"."price_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_admin_id_users_id_fk" FOREIGN KEY ("initiated_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_ledger_entries" ADD CONSTRAINT "worker_ledger_entries_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_ledger_entries" ADD CONSTRAINT "worker_ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_ledger_entries" ADD CONSTRAINT "worker_ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_admin_id_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_reviewer_admin_id_users_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_application_id_verification_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_default" and "addresses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_roles_idx" ON "users" USING gin ("roles");--> statement-breakpoint
CREATE INDEX "services_search_idx" ON "services" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id","is_active");--> statement-breakpoint
CREATE INDEX "worker_availability_rules_worker_idx" ON "worker_availability_rules" USING btree ("worker_id","weekday");--> statement-breakpoint
CREATE INDEX "worker_profiles_status_online_idx" ON "worker_profiles" USING btree ("verification_status","is_online");--> statement-breakpoint
CREATE INDEX "worker_profiles_base_idx" ON "worker_profiles" USING btree ("base_lat","base_lng");--> statement-breakpoint
CREATE INDEX "worker_service_pricing_service_idx" ON "worker_service_pricing" USING btree ("service_id","is_active");--> statement-breakpoint
CREATE INDEX "worker_skills_category_idx" ON "worker_skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "worker_time_off_period_idx" ON "worker_time_off" USING gist ("worker_id","period");--> statement-breakpoint
CREATE INDEX "booking_charges_booking_idx" ON "booking_charges" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_invitations_worker_idx" ON "booking_invitations" USING btree ("worker_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_idx" ON "booking_status_history" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_created_idx" ON "bookings" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_worker_status_idx" ON "bookings" USING btree ("worker_id","status");--> statement-breakpoint
CREATE INDEX "bookings_status_expires_idx" ON "bookings" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "bookings_category_status_idx" ON "bookings" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "negotiation_messages_thread_idx" ON "negotiation_messages" USING btree ("booking_id","worker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_offers_one_pending_per_thread" ON "price_offers" USING btree ("booking_id","worker_id") WHERE "price_offers"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "price_offers_one_accepted_per_booking" ON "price_offers" USING btree ("booking_id") WHERE "price_offers"."status" = 'ACCEPTED';--> statement-breakpoint
CREATE INDEX "price_offers_thread_idx" ON "price_offers" USING btree ("booking_id","worker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_captured_per_booking" ON "payments" USING btree ("booking_id") WHERE "payments"."status" in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payouts_worker_idx" ON "payouts" USING btree ("worker_id","requested_at");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "worker_ledger_entries_worker_idx" ON "worker_ledger_entries" USING btree ("worker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_ledger_entries_once_per_booking" ON "worker_ledger_entries" USING btree ("booking_id","type") WHERE "worker_ledger_entries"."type" in ('JOB_EARNING', 'COMMISSION', 'CASH_COLLECTED');--> statement-breakpoint
CREATE INDEX "dispute_evidence_dispute_idx" ON "dispute_evidence" USING btree ("dispute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_booking" ON "disputes" USING btree ("booking_id") WHERE "disputes"."status" in ('OPEN', 'UNDER_REVIEW');--> statement-breakpoint
CREATE INDEX "disputes_queue_idx" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reviews_worker_idx" ON "reviews" USING btree ("worker_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_queue_idx" ON "support_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_applications_one_open_per_worker" ON "verification_applications" USING btree ("worker_id") WHERE "verification_applications"."status" in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUESTED');--> statement-breakpoint
CREATE INDEX "verification_applications_queue_idx" ON "verification_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "verification_documents_application_idx" ON "verification_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_idx" ON "admin_audit_logs" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at") WHERE "outbox_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "uploads_owner_idx" ON "uploads" USING btree ("owner_user_id","created_at");