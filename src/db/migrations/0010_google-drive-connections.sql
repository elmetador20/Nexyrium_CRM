CREATE TYPE "public"."google_drive_connection_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "google_drive_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"google_account_email" varchar(320) NOT NULL,
	"google_subject" varchar(255),
	"encrypted_refresh_token" text NOT NULL,
	"scopes" text NOT NULL,
	"folder_id" varchar(255),
	"folder_name" varchar(255),
	"folder_verified_at" timestamp with time zone,
	"status" "google_drive_connection_status" DEFAULT 'active' NOT NULL,
	"last_error_code" varchar(100),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_drive_connections_single_active" ON "google_drive_connections" USING btree ("status") WHERE "google_drive_connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "google_drive_connections_connected_by_idx" ON "google_drive_connections" USING btree ("connected_by_user_id");