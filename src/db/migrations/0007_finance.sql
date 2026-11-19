CREATE TYPE "public"."finance_command_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."financial_artifact_status" AS ENUM('pending', 'available', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('posted', 'reversed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'sent', 'accepted', 'expired', 'canceled');--> statement-breakpoint
CREATE TABLE "finance_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" varchar(80) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" "finance_command_status" DEFAULT 'processing' NOT NULL,
	"resource_type" varchar(80),
	"resource_id" uuid,
	"result" jsonb,
	"error_message" text,
	"actor_user_id" uuid,
	"correlation_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid,
	"invoice_id" uuid,
	"artifact_type" varchar(30) NOT NULL,
	"renderer_version" varchar(50) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_object_id" varchar(255) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"status" "financial_artifact_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit_price_minor" numeric(20, 0) NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"line_subtotal_minor" numeric(20, 0) NOT NULL,
	"line_discount_minor" numeric(20, 0) NOT NULL,
	"line_tax_minor" numeric(20, 0) NOT NULL,
	"line_total_minor" numeric(20, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"renderer_version" varchar(50),
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(60),
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid,
	"project_id" uuid,
	"quotation_id" uuid,
	"title" varchar(200) NOT NULL,
	"notes" text,
	"payment_terms" text,
	"due_date" date,
	"currency_code" varchar(3) NOT NULL,
	"subtotal_minor" numeric(20, 0) NOT NULL,
	"discount_minor" numeric(20, 0) NOT NULL,
	"tax_minor" numeric(20, 0) NOT NULL,
	"total_minor" numeric(20, 0) NOT NULL,
	"owner_id" uuid,
	"department_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"allocated_amount_minor" numeric(20, 0) NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allocated_by_user_id" uuid NOT NULL,
	"reversal_of_id" uuid
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_minor" numeric(20, 0) NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"external_reference" varchar(255),
	"idempotency_key" varchar(255) NOT NULL,
	"status" "payment_status" DEFAULT 'posted' NOT NULL,
	"owner_id" uuid,
	"department_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit_price_minor" numeric(20, 0) NOT NULL,
	"discount_bps" integer DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"line_subtotal_minor" numeric(20, 0) NOT NULL,
	"line_discount_minor" numeric(20, 0) NOT NULL,
	"line_tax_minor" numeric(20, 0) NOT NULL,
	"line_total_minor" numeric(20, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"renderer_version" varchar(50),
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_number" varchar(60),
	"revision" integer DEFAULT 0 NOT NULL,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_id" uuid,
	"project_id" uuid,
	"title" varchar(200) NOT NULL,
	"notes" text,
	"payment_terms" text,
	"due_date" date,
	"currency_code" varchar(3) NOT NULL,
	"subtotal_minor" numeric(20, 0) NOT NULL,
	"discount_minor" numeric(20, 0) NOT NULL,
	"tax_minor" numeric(20, 0) NOT NULL,
	"total_minor" numeric(20, 0) NOT NULL,
	"owner_id" uuid,
	"department_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"issued_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_commands" ADD CONSTRAINT "finance_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_artifacts" ADD CONSTRAINT "financial_artifacts_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_artifacts" ADD CONSTRAINT "financial_artifacts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_artifacts" ADD CONSTRAINT "financial_artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_versions" ADD CONSTRAINT "invoice_versions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_versions" ADD CONSTRAINT "invoice_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocated_by_user_id_users_id_fk" FOREIGN KEY ("allocated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_commands_operation_key_unique" ON "finance_commands" USING btree ("operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "finance_commands_status_idx" ON "finance_commands" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_number_sequences_type_period_unique" ON "finance_number_sequences" USING btree ("document_type","period_key");--> statement-breakpoint
CREATE INDEX "financial_artifacts_quotation_idx" ON "financial_artifacts" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "financial_artifacts_invoice_idx" ON "financial_artifacts" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_artifacts_checksum_unique" ON "financial_artifacts" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_position_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_versions_invoice_unique" ON "invoice_versions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_versions_hash_idx" ON "invoice_versions" USING btree ("snapshot_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_client_status_idx" ON "invoices" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "invoices_owner_status_idx" ON "invoices" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "invoices_due_date_idx" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_unique" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_reference_unique" ON "payments" USING btree ("external_reference");--> statement-breakpoint
CREATE INDEX "payments_client_status_idx" ON "payments" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "quotation_lines_quotation_position_idx" ON "quotation_lines" USING btree ("quotation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_versions_quotation_revision_unique" ON "quotation_versions" USING btree ("quotation_id","revision");--> statement-breakpoint
CREATE INDEX "quotation_versions_hash_idx" ON "quotation_versions" USING btree ("snapshot_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_unique" ON "quotations" USING btree ("quotation_number");--> statement-breakpoint
CREATE INDEX "quotations_client_status_idx" ON "quotations" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "quotations_owner_status_idx" ON "quotations" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "quotations_project_idx" ON "quotations" USING btree ("project_id");