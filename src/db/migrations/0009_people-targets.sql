CREATE TYPE "public"."employment_status" AS ENUM('active', 'on_leave', 'terminated', 'contractor');--> statement-breakpoint
CREATE TYPE "public"."target_unit" AS ENUM('count', 'minor_amount');--> statement-breakpoint
CREATE TABLE "department_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"metric_key" varchar(80) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"unit" "target_unit" NOT NULL,
	"target_count" integer,
	"target_minor" numeric(20, 0),
	"currency_code" varchar(3),
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_targets_period_valid" CHECK ("department_targets"."period_end" >= "department_targets"."period_start"),
	CONSTRAINT "department_targets_value_valid" CHECK (("department_targets"."unit" = 'count' AND "department_targets"."target_count" IS NOT NULL AND "department_targets"."target_count" >= 0 AND "department_targets"."target_minor" IS NULL AND "department_targets"."currency_code" IS NULL) OR ("department_targets"."unit" = 'minor_amount' AND "department_targets"."target_count" IS NULL AND "department_targets"."target_minor" IS NOT NULL AND "department_targets"."target_minor" >= 0 AND "department_targets"."currency_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "people_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"job_title" varchar(160),
	"employment_status" "employment_status" DEFAULT 'active' NOT NULL,
	"manager_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_targets" ADD CONSTRAINT "department_targets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_targets" ADD CONSTRAINT "department_targets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_targets" ADD CONSTRAINT "department_targets_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_profiles" ADD CONSTRAINT "people_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "department_targets_period_metric_unique" ON "department_targets" USING btree ("department_id","metric_key","period_start","period_end");--> statement-breakpoint
CREATE INDEX "department_targets_department_period_idx" ON "department_targets" USING btree ("department_id","period_start","period_end");