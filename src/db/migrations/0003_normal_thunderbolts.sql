CREATE TYPE "public"."duplicate_review_decision" AS ENUM('link_existing', 'create_new', 'reject');--> statement-breakpoint
CREATE TYPE "public"."duplicate_review_status" AS ENUM('pending', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."lead_intake_outcome" AS ENUM('created', 'linked_existing', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."lead_intake_status" AS ENUM('processing', 'created', 'linked_existing', 'needs_review');--> statement-breakpoint
CREATE TABLE "lead_duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_event_id" uuid NOT NULL,
	"candidate_lead_id" uuid NOT NULL,
	"matched_by" jsonb NOT NULL,
	"status" "duplicate_review_status" DEFAULT 'pending' NOT NULL,
	"decision" "duplicate_review_decision",
	"resolved_lead_id" uuid,
	"reviewer_user_id" uuid,
	"reviewer_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_identity_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(20) NOT NULL,
	"value" varchar(320) NOT NULL,
	"lead_id" uuid NOT NULL,
	"first_intake_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_intake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"source" varchar(50) NOT NULL,
	"source_identifier" varchar(255),
	"payload_hash" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"normalized_email" varchar(320),
	"normalized_phone" varchar(40),
	"normalization_version" varchar(20) NOT NULL,
	"status" "lead_intake_status" DEFAULT 'processing' NOT NULL,
	"outcome" "lead_intake_outcome",
	"lead_id" uuid,
	"actor_user_id" uuid,
	"correlation_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_source_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(50) NOT NULL,
	"source_identifier" varchar(255) NOT NULL,
	"lead_id" uuid NOT NULL,
	"first_intake_event_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalized_email" varchar(320);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalized_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "normalization_version" varchar(20);--> statement-breakpoint
UPDATE "leads" SET "normalized_email" = lower(btrim("email")), "normalization_version" = 'v1' WHERE "email" IS NOT NULL AND btrim("email") <> '';--> statement-breakpoint
UPDATE "leads" SET "normalized_phone" = '+' || regexp_replace("phone", '\D', '', 'g'), "normalization_version" = 'v1' WHERE "phone" IS NOT NULL AND "phone" ~ '^\+';--> statement-breakpoint
ALTER TABLE "lead_duplicate_reviews" ADD CONSTRAINT "lead_duplicate_reviews_intake_event_id_lead_intake_events_id_fk" FOREIGN KEY ("intake_event_id") REFERENCES "public"."lead_intake_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_reviews" ADD CONSTRAINT "lead_duplicate_reviews_candidate_lead_id_leads_id_fk" FOREIGN KEY ("candidate_lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_reviews" ADD CONSTRAINT "lead_duplicate_reviews_resolved_lead_id_leads_id_fk" FOREIGN KEY ("resolved_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_reviews" ADD CONSTRAINT "lead_duplicate_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_keys" ADD CONSTRAINT "lead_identity_keys_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identity_keys" ADD CONSTRAINT "lead_identity_keys_first_intake_event_id_lead_intake_events_id_fk" FOREIGN KEY ("first_intake_event_id") REFERENCES "public"."lead_intake_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intake_events" ADD CONSTRAINT "lead_intake_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_intake_events" ADD CONSTRAINT "lead_intake_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_source_identities" ADD CONSTRAINT "lead_source_identities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_source_identities" ADD CONSTRAINT "lead_source_identities_first_intake_event_id_lead_intake_events_id_fk" FOREIGN KEY ("first_intake_event_id") REFERENCES "public"."lead_intake_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_duplicate_reviews_event_candidate_unique" ON "lead_duplicate_reviews" USING btree ("intake_event_id","candidate_lead_id");--> statement-breakpoint
CREATE INDEX "lead_duplicate_reviews_status_idx" ON "lead_duplicate_reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_duplicate_reviews_candidate_idx" ON "lead_duplicate_reviews" USING btree ("candidate_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_identity_keys_kind_value_unique" ON "lead_identity_keys" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "lead_identity_keys_lead_idx" ON "lead_identity_keys" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_intake_events_source_idempotency_key_unique" ON "lead_intake_events" USING btree ("source","idempotency_key");--> statement-breakpoint
CREATE INDEX "lead_intake_events_source_idx" ON "lead_intake_events" USING btree ("source","source_identifier");--> statement-breakpoint
CREATE INDEX "lead_intake_events_status_idx" ON "lead_intake_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_intake_events_lead_idx" ON "lead_intake_events" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_source_identities_source_identifier_unique" ON "lead_source_identities" USING btree ("source","source_identifier");--> statement-breakpoint
CREATE INDEX "lead_source_identities_lead_idx" ON "lead_source_identities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_normalized_email_idx" ON "leads" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "leads_normalized_phone_idx" ON "leads" USING btree ("normalized_phone");
