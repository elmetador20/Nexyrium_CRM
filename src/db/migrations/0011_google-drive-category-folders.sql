CREATE TYPE "public"."google_drive_category" AS ENUM('expense', 'invoice', 'document', 'quotation');--> statement-breakpoint
CREATE TABLE "google_drive_folder_mappings" (
	"connection_id" uuid NOT NULL,
	"category" "google_drive_category" NOT NULL,
	"folder_id" varchar(255) NOT NULL,
	"folder_name" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"configured_by" uuid NOT NULL,
	CONSTRAINT "google_drive_folder_mappings_connection_id_category_pk" PRIMARY KEY("connection_id","category")
);
--> statement-breakpoint
CREATE TABLE "google_drive_upload_operations" (
	"connection_id" uuid NOT NULL,
	"category" "google_drive_category" NOT NULL,
	"operation_key" varchar(64) NOT NULL,
	"folder_id" varchar(255) NOT NULL,
	"file_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	CONSTRAINT "google_drive_upload_operations_connection_id_category_operation_key_pk" PRIMARY KEY("connection_id","category","operation_key")
);
--> statement-breakpoint
ALTER TABLE "google_drive_folder_mappings" ADD CONSTRAINT "google_drive_folder_mappings_connection_id_google_drive_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_drive_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_folder_mappings" ADD CONSTRAINT "google_drive_folder_mappings_configured_by_users_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_upload_operations" ADD CONSTRAINT "google_drive_upload_operations_connection_id_google_drive_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_drive_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_folder_per_connection" ON "google_drive_folder_mappings" USING btree ("connection_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_reserved_file" ON "google_drive_upload_operations" USING btree ("file_id");