CREATE TYPE "public"."document_provider" AS ENUM('google_drive');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'available', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_storage_status" AS ENUM('uploaded', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "document_clients" (
	"document_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_clients_document_id_client_id_pk" PRIMARY KEY("document_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "document_deals" (
	"document_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_deals_document_id_deal_id_pk" PRIMARY KEY("document_id","deal_id")
);
--> statement-breakpoint
CREATE TABLE "document_leads" (
	"document_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_leads_document_id_lead_id_pk" PRIMARY KEY("document_id","lead_id")
);
--> statement-breakpoint
CREATE TABLE "document_storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"provider" "document_provider" NOT NULL,
	"provider_object_id" varchar(255) NOT NULL,
	"provider_parent_id" varchar(255),
	"provider_revision" varchar(255),
	"provider_etag" varchar(255),
	"checksum" varchar(64),
	"size_bytes" integer,
	"status" "document_storage_status" DEFAULT 'uploaded' NOT NULL,
	"provider_metadata" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"category" varchar(100),
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"owner_id" uuid,
	"department_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid,
	"failure_code" varchar(100),
	"failure_message" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_clients" ADD CONSTRAINT "document_clients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_deals" ADD CONSTRAINT "document_deals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_deals" ADD CONSTRAINT "document_deals_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_leads" ADD CONSTRAINT "document_leads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_leads" ADD CONSTRAINT "document_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_storage_objects" ADD CONSTRAINT "document_storage_objects_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_clients_client_idx" ON "document_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "document_deals_deal_idx" ON "document_deals" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "document_leads_lead_idx" ON "document_leads" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_objects_document_provider_unique" ON "document_storage_objects" USING btree ("document_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "document_storage_objects_provider_object_unique" ON "document_storage_objects" USING btree ("provider","provider_object_id");--> statement-breakpoint
CREATE INDEX "document_storage_objects_status_idx" ON "document_storage_objects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_owner_status_idx" ON "documents" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "documents_department_status_idx" ON "documents" USING btree ("department_id","status");--> statement-breakpoint
CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_checksum_idx" ON "documents" USING btree ("checksum");