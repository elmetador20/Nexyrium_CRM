import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { DEAL_STAGES, LEAD_STATUSES } from "@/types/crm";

export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const dealStageEnum = pgEnum("deal_stage", DEAL_STAGES);
export const leadIntakeOutcomeEnum = pgEnum("lead_intake_outcome", ["created", "linked_existing", "needs_review"]);
export const leadIntakeStatusEnum = pgEnum("lead_intake_status", ["processing", "created", "linked_existing", "needs_review"]);
export const duplicateReviewStatusEnum = pgEnum("duplicate_review_status", ["pending", "resolved", "rejected"]);
export const duplicateReviewDecisionEnum = pgEnum("duplicate_review_decision", ["link_existing", "create_new", "reject"]);
export const leadImportFormatEnum = pgEnum("lead_import_format", ["csv", "xlsx"]);
export const leadImportJobStatusEnum = pgEnum("lead_import_job_status", ["previewed", "validated", "processing", "completed", "completed_with_errors", "failed", "canceled"]);
export const leadImportRowStatusEnum = pgEnum("lead_import_row_status", ["valid", "invalid", "processing", "created", "linked_existing", "needs_review", "failed"]);
export const metaIntegrationEventStatusEnum = pgEnum("meta_integration_event_status", ["received", "processing", "processed", "needs_review", "duplicate", "rejected", "failed"]);
export const metaSignatureStatusEnum = pgEnum("meta_signature_status", ["verified", "rejected", "missing"]);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_active_idx").on(table.isActive)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("roles_slug_unique").on(table.slug)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 150 }).notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("permissions_slug_unique").on(table.slug)],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 150 }).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("departments_slug_unique").on(table.slug)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_id_idx").on(table.roleId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const userDepartments = pgTable(
  "user_departments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.departmentId] }),
    index("user_departments_department_id_idx").on(table.departmentId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_email_idx").on(table.email),
    index("invitations_expiry_idx").on(table.expiresAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactName: varchar("contact_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    normalizedPhone: varchar("normalized_phone", { length: 40 }),
    normalizationVersion: varchar("normalization_version", { length: 20 }),
    companyName: varchar("company_name", { length: 200 }),
    source: varchar("source", { length: 100 }).notNull(),
    sourceDetails: text("source_details"),
    status: leadStatusEnum("status").default("new").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("leads_owner_status_idx").on(table.ownerId, table.status),
    index("leads_department_status_idx").on(table.departmentId, table.status),
    index("leads_next_action_idx").on(table.nextActionAt),
    index("leads_source_idx").on(table.source),
    index("leads_normalized_email_idx").on(table.normalizedEmail),
    index("leads_normalized_phone_idx").on(table.normalizedPhone),
  ],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    type: varchar("type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("lead_activities_lead_occurred_idx").on(table.leadId, table.occurredAt)],
);

export const leadSourceHistory = pgTable(
  "lead_source_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 100 }).notNull(),
    details: text("details"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("lead_source_history_lead_recorded_idx").on(table.leadId, table.recordedAt)],
);

export const leadIntakeEvents = pgTable(
  "lead_intake_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    source: varchar("source", { length: 50 }).notNull(),
    sourceIdentifier: varchar("source_identifier", { length: 255 }),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    normalizedPhone: varchar("normalized_phone", { length: 40 }),
    normalizationVersion: varchar("normalization_version", { length: 20 }).notNull(),
    status: leadIntakeStatusEnum("status").default("processing").notNull(),
    outcome: leadIntakeOutcomeEnum("outcome"),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: varchar("correlation_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("lead_intake_events_source_idempotency_key_unique").on(table.source, table.idempotencyKey),
    index("lead_intake_events_source_idx").on(table.source, table.sourceIdentifier),
    index("lead_intake_events_status_idx").on(table.status, table.createdAt),
    index("lead_intake_events_lead_idx").on(table.leadId),
  ],
);

export const leadSourceIdentities = pgTable(
  "lead_source_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: varchar("source", { length: 50 }).notNull(),
    sourceIdentifier: varchar("source_identifier", { length: 255 }).notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    firstIntakeEventId: uuid("first_intake_event_id").references(() => leadIntakeEvents.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_source_identities_source_identifier_unique").on(table.source, table.sourceIdentifier),
    index("lead_source_identities_lead_idx").on(table.leadId),
  ],
);

export const leadIdentityKeys = pgTable(
  "lead_identity_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: varchar("kind", { length: 20 }).notNull(),
    value: varchar("value", { length: 320 }).notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    firstIntakeEventId: uuid("first_intake_event_id").references(() => leadIntakeEvents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_identity_keys_kind_value_unique").on(table.kind, table.value),
    index("lead_identity_keys_lead_idx").on(table.leadId),
  ],
);

export const leadDuplicateReviews = pgTable(
  "lead_duplicate_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    intakeEventId: uuid("intake_event_id")
      .notNull()
      .references(() => leadIntakeEvents.id, { onDelete: "cascade" }),
    candidateLeadId: uuid("candidate_lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    matchedBy: jsonb("matched_by").$type<Array<"email" | "phone">>().notNull(),
    status: duplicateReviewStatusEnum("status").default("pending").notNull(),
    decision: duplicateReviewDecisionEnum("decision"),
    resolvedLeadId: uuid("resolved_lead_id").references(() => leads.id, { onDelete: "set null" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewerNotes: text("reviewer_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_duplicate_reviews_event_candidate_unique").on(table.intakeEventId, table.candidateLeadId),
    index("lead_duplicate_reviews_status_idx").on(table.status, table.createdAt),
    index("lead_duplicate_reviews_candidate_idx").on(table.candidateLeadId),
  ],
);

export const leadImportJobs = pgTable(
  "lead_import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    format: leadImportFormatEnum("format").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    worksheetName: varchar("worksheet_name", { length: 255 }),
    source: varchar("source", { length: 50 }).notNull(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull(),
    columnMapping: jsonb("column_mapping").$type<Record<string, string>>().notNull(),
    status: leadImportJobStatusEnum("status").default("previewed").notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    validRows: integer("valid_rows").default(0).notNull(),
    invalidRows: integer("invalid_rows").default(0).notNull(),
    createdCount: integer("created_count").default(0).notNull(),
    linkedCount: integer("linked_count").default(0).notNull(),
    needsReviewCount: integer("needs_review_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    errorSummary: jsonb("error_summary").$type<Array<{ code: string; count: number }>>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("lead_import_jobs_creator_created_idx").on(table.createdByUserId, table.createdAt),
    index("lead_import_jobs_status_created_idx").on(table.status, table.createdAt),
    index("lead_import_jobs_source_idx").on(table.source),
  ],
);

export const leadImportRows = pgTable(
  "lead_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => leadImportJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    validationIssues: jsonb("validation_issues").$type<Array<{ code: string; message: string; severity: "error" | "warning" }>>().notNull(),
    status: leadImportRowStatusEnum("status").default("valid").notNull(),
    intakeEventId: uuid("intake_event_id").references(() => leadIntakeEvents.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    outcome: leadIntakeOutcomeEnum("outcome"),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_import_rows_job_row_unique").on(table.jobId, table.rowNumber),
    uniqueIndex("lead_import_rows_job_idempotency_unique").on(table.jobId, table.idempotencyKey),
    index("lead_import_rows_job_status_idx").on(table.jobId, table.status),
    index("lead_import_rows_intake_event_idx").on(table.intakeEventId),
  ],
);

export const metaIntegrationEvents = pgTable(
  "meta_integration_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 30 }).default("meta").notNull(),
    integrationKey: varchar("integration_key", { length: 100 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    pageId: varchar("page_id", { length: 100 }),
    formId: varchar("form_id", { length: 100 }),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    signatureStatus: metaSignatureStatusEnum("signature_status").notNull(),
    status: metaIntegrationEventStatusEnum("status").default("received").notNull(),
    safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull(),
    intakeEventIds: jsonb("intake_event_ids").$type<string[]>().notNull(),
    leadIds: jsonb("lead_ids").$type<string[]>().notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    correlationId: varchar("correlation_id", { length: 128 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("meta_integration_events_identity_unique").on(table.provider, table.integrationKey, table.externalEventId),
    index("meta_integration_events_status_received_idx").on(table.status, table.receivedAt),
    index("meta_integration_events_page_received_idx").on(table.pageId, table.receivedAt),
    index("meta_integration_events_correlation_idx").on(table.correlationId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    companyName: varchar("company_name", { length: 200 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    website: varchar("website", { length: 500 }),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("clients_owner_idx").on(table.ownerId),
    index("clients_department_idx").on(table.departmentId),
    index("clients_company_name_idx").on(table.companyName),
  ],
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    jobTitle: varchar("job_title", { length: 150 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("client_contacts_client_idx").on(table.clientId)],
);

export const clientLeads = pgTable(
  "client_leads",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.leadId] }),
    index("client_leads_lead_idx").on(table.leadId),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    stage: dealStageEnum("stage").default("prospecting").notNull(),
    expectedValue: numeric("expected_value", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    expectedCloseDate: date("expected_close_date"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check("deals_expected_value_non_negative", sql`${table.expectedValue} >= 0`),
    index("deals_owner_stage_idx").on(table.ownerId, table.stage),
    index("deals_department_stage_idx").on(table.departmentId, table.stage),
    index("deals_client_idx").on(table.clientId),
    index("deals_lead_idx").on(table.leadId),
    index("deals_expected_close_date_idx").on(table.expectedCloseDate),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: text("resource_id"),
    outcome: varchar("outcome", { length: 30 }).notNull(),
    correlationId: varchar("correlation_id", { length: 128 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_created_at_idx").on(table.actorUserId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_action_created_at_idx").on(table.action, table.createdAt),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type UserDepartment = typeof userDepartments.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type LeadSourceHistory = typeof leadSourceHistory.$inferSelect;
export type LeadIntakeEvent = typeof leadIntakeEvents.$inferSelect;
export type LeadSourceIdentity = typeof leadSourceIdentities.$inferSelect;
export type LeadIdentityKey = typeof leadIdentityKeys.$inferSelect;
export type LeadDuplicateReview = typeof leadDuplicateReviews.$inferSelect;
export type LeadImportJob = typeof leadImportJobs.$inferSelect;
export type LeadImportRow = typeof leadImportRows.$inferSelect;
export type MetaIntegrationEvent = typeof metaIntegrationEvents.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientContact = typeof clientContacts.$inferSelect;
export type ClientLead = typeof clientLeads.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
