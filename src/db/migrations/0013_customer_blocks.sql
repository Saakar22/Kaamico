CREATE TABLE "customer_blocks" (
	"customer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_blocks_customer_id_worker_id_pk" PRIMARY KEY("customer_id","worker_id")
);
--> statement-breakpoint
ALTER TABLE "customer_blocks" ADD CONSTRAINT "customer_blocks_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_blocks" ADD CONSTRAINT "customer_blocks_worker_id_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;