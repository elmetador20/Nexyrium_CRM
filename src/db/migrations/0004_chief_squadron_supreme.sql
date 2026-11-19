CREATE TYPE "public"."lead_import_format" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."lead_import_job_status" AS ENUM('previewed', 'validated', 'processing', 'completed', 'completed_with_errors', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."lead_import_row_status" AS ENUM('valid', 'invalid', 'processing', 'created', 'linked_existing', 'needs_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meta_integration_event_status" AS ENUM('received', 'processing', 'processed', 'needs_review', 'duplicate', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meta_signature_status" AS ENUM('verified', 'rejected', 'missing');--> statement-breakpoint
CREATE TABLE "lead_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"department_id" uuid,
	"filename" varchar(255) NOT NULL,
	"format" "lead_import_format" NOT NULL,
	"file_size" integer NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"worksheet_name" varchar(255),
	"source" varchar(50) NOT NULL,
	"source_metadata" jsonb NOT NULL,
	"column_mapping" jsonb NOT NULL,
	"status" "lead_import_job_status" DEFAULT 'previewed' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"linked_count" integer DEFAULT 0 NOT NULL,
	"needs_review_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"validation_issues" jsonb NOT NULL,
	"status" "lead_import_row_status" DEFAULT 'valid' NOT NULL,
	"intake_event_id" uuid,
	"lead_id" uuid,
	"outcome" "lead_intake_outcome",
	"error_code" varchar(100),
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(30) DEFAULT 'meta' NOT NULL,
	"integration_key" varchar(100) NOT NULL,
	"external_event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"page_id" varchar(100),
	"form_id" varchar(100),
	"payload_hash" varchar(64) NOT NULL,
	"signature_status" "meta_signature_status" NOT NULL,
	"status" "meta_integration_event_status" DEFAULT 'received' NOT NULL,
	"safe_metadata" jsonb NOT NULL,
	"intake_event_ids" jsonb NOT NULL,
	"lead_ids" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"correlation_id" varchar(128),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_import_jobs" ADD CONSTRAINT "lead_import_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_jobs" ADD CONSTRAINT "lead_import_jobs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_job_id_lead_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."lead_import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_intake_event_id_lead_intake_events_id_fk" FOREIGN KEY ("intake_event_id") REFERENCES "public"."lead_intake_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_import_jobs_creator_created_idx" ON "lead_import_jobs" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_import_jobs_status_created_idx" ON "lead_import_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_import_jobs_source_idx" ON "lead_import_jobs" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_import_rows_job_row_unique" ON "lead_import_rows" USING btree ("job_id","row_number");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_import_rows_job_idempotency_unique" ON "lead_import_rows" USING btree ("job_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "lead_import_rows_job_status_idx" ON "lead_import_rows" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "lead_import_rows_intake_event_idx" ON "lead_import_rows" USING btree ("intake_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_integration_events_identity_unique" ON "meta_integration_events" USING btree ("provider","integration_key","external_event_id");--> statement-breakpoint
CREATE INDEX "meta_integration_events_status_received_idx" ON "meta_integration_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "meta_integration_events_page_received_idx" ON "meta_integration_events" USING btree ("page_id","received_at");--> statement-breakpoint
CREATE INDEX "meta_integration_events_correlation_idx" ON "meta_integration_events" USING btree ("correlation_id");