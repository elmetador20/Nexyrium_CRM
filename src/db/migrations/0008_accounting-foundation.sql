CREATE TYPE "public"."accounting_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."accounting_period_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."accounting_source_action" AS ENUM('posted', 'reversed', 'adjusted', 'matched');--> statement-breakpoint
CREATE TYPE "public"."accounting_source_type" AS ENUM('expense', 'invoice', 'payment', 'manual', 'reconciliation');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."accounting_normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_item_status" AS ENUM('unmatched', 'matched', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('draft', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "accounting_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(160) NOT NULL,
	"account_type" "accounting_account_type" NOT NULL,
	"normal_balance" "accounting_normal_balance" NOT NULL,
	"parent_account_id" uuid,
	"is_postable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" varchar(7) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "accounting_period_status" DEFAULT 'open' NOT NULL,
	"closed_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_range_valid" CHECK ("accounting_periods"."ends_on" >= "accounting_periods"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "accounting_reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"external_transaction_id" varchar(255) NOT NULL,
	"transaction_on" date NOT NULL,
	"description" text NOT NULL,
	"amount_minor" numeric(20, 0) NOT NULL,
	"direction" "reconciliation_direction" NOT NULL,
	"status" "reconciliation_item_status" DEFAULT 'unmatched' NOT NULL,
	"matched_journal_entry_line_id" uuid,
	"matched_by_user_id" uuid,
	"matched_at" timestamp with time zone,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_reconciliation_items_amount_positive" CHECK ("accounting_reconciliation_items"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "accounting_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"statement_reference" varchar(255) NOT NULL,
	"statement_start_on" date NOT NULL,
	"statement_end_on" date NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"opening_balance_minor" numeric(20, 0) NOT NULL,
	"closing_balance_minor" numeric(20, 0) NOT NULL,
	"calculated_difference_minor" numeric(20, 0) DEFAULT '0' NOT NULL,
	"status" "reconciliation_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"completed_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_reconciliations_date_range_valid" CHECK ("accounting_reconciliations"."statement_end_on" >= "accounting_reconciliations"."statement_start_on")
);
--> statement-breakpoint
CREATE TABLE "expense_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(120) NOT NULL,
	"merchant_name" varchar(200),
	"description" text NOT NULL,
	"amount_minor" numeric(20, 0) NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"incurred_on" date NOT NULL,
	"status" "expense_status" DEFAULT 'draft' NOT NULL,
	"department_id" uuid,
	"project_id" uuid,
	"client_id" uuid,
	"owner_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approval_reason" text,
	"rejected_by_user_id" uuid,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_number" varchar(60),
	"entry_date" date NOT NULL,
	"period_id" uuid NOT NULL,
	"status" "journal_entry_status" DEFAULT 'draft' NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"memo" text NOT NULL,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"posted_by_user_id" uuid,
	"posted_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"debit_minor" numeric(20, 0) NOT NULL,
	"credit_minor" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entry_lines_debit_nonnegative" CHECK ("journal_entry_lines"."debit_minor" >= 0),
	CONSTRAINT "journal_entry_lines_credit_nonnegative" CHECK ("journal_entry_lines"."credit_minor" >= 0),
	CONSTRAINT "journal_entry_lines_one_side_only" CHECK (("journal_entry_lines"."debit_minor" > 0 AND "journal_entry_lines"."credit_minor" = 0) OR ("journal_entry_lines"."debit_minor" = 0 AND "journal_entry_lines"."credit_minor" > 0))
);
--> statement-breakpoint
CREATE TABLE "journal_entry_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"source_type" "accounting_source_type" NOT NULL,
	"source_id" varchar(100) NOT NULL,
	"source_action" "accounting_source_action" NOT NULL,
	"external_reference" varchar(255),
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliation_items" ADD CONSTRAINT "accounting_reconciliation_items_reconciliation_id_accounting_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."accounting_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliation_items" ADD CONSTRAINT "accounting_reconciliation_items_matched_journal_entry_line_id_journal_entry_lines_id_fk" FOREIGN KEY ("matched_journal_entry_line_id") REFERENCES "public"."journal_entry_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliation_items" ADD CONSTRAINT "accounting_reconciliation_items_matched_by_user_id_users_id_fk" FOREIGN KEY ("matched_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliations" ADD CONSTRAINT "accounting_reconciliations_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliations" ADD CONSTRAINT "accounting_reconciliations_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliations" ADD CONSTRAINT "accounting_reconciliations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_reconciliations" ADD CONSTRAINT "accounting_reconciliations_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipts" ADD CONSTRAINT "expense_receipts_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipts" ADD CONSTRAINT "expense_receipts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_receipts" ADD CONSTRAINT "expense_receipts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_sources" ADD CONSTRAINT "journal_entry_sources_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_accounts_code_unique" ON "accounting_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "accounting_accounts_parent_idx" ON "accounting_accounts" USING btree ("parent_account_id");--> statement-breakpoint
CREATE INDEX "accounting_accounts_active_idx" ON "accounting_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_periods_key_unique" ON "accounting_periods" USING btree ("period_key");--> statement-breakpoint
CREATE INDEX "accounting_periods_status_idx" ON "accounting_periods" USING btree ("status","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_reconciliation_items_external_unique" ON "accounting_reconciliation_items" USING btree ("reconciliation_id","external_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_reconciliation_items_matched_line_unique" ON "accounting_reconciliation_items" USING btree ("matched_journal_entry_line_id");--> statement-breakpoint
CREATE INDEX "accounting_reconciliation_items_reconciliation_idx" ON "accounting_reconciliation_items" USING btree ("reconciliation_id","status");--> statement-breakpoint
CREATE INDEX "accounting_reconciliations_account_period_idx" ON "accounting_reconciliations" USING btree ("account_id","period_id");--> statement-breakpoint
CREATE INDEX "accounting_reconciliations_status_idx" ON "accounting_reconciliations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_receipts_expense_document_unique" ON "expense_receipts" USING btree ("expense_id","document_id");--> statement-breakpoint
CREATE INDEX "expense_receipts_expense_idx" ON "expense_receipts" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expenses_owner_status_idx" ON "expenses" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "expenses_department_status_idx" ON "expenses" USING btree ("department_id","status");--> statement-breakpoint
CREATE INDEX "expenses_incurred_on_idx" ON "expenses" USING btree ("incurred_on");--> statement-breakpoint
CREATE INDEX "expenses_client_idx" ON "expenses" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_unique" ON "journal_entries" USING btree ("entry_number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reversal_unique" ON "journal_entries" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "journal_entries_period_status_idx" ON "journal_entries" USING btree ("period_id","status");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_reversal_idx" ON "journal_entries" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_lines_entry_position_unique" ON "journal_entry_lines" USING btree ("journal_entry_id","position");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_sources_reference_unique" ON "journal_entry_sources" USING btree ("source_type","source_id","source_action","external_reference");--> statement-breakpoint
CREATE INDEX "journal_entry_sources_entry_idx" ON "journal_entry_sources" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_sources_source_idx" ON "journal_entry_sources" USING btree ("source_type","source_id");