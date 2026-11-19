import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { clients, departments, deals, leads, users } from "./foundation";

export const documentStatusEnum = pgEnum("document_status", ["pending", "available", "failed", "archived"]);
export const documentProviderEnum = pgEnum("document_provider", ["google_drive"]);
export const documentStorageStatusEnum = pgEnum("document_storage_status", ["uploaded", "failed", "deleted"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 150 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    category: varchar("category", { length: 100 }),
    status: documentStatusEnum("status").default("pending").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    failureCode: varchar("failure_code", { length: 100 }),
    failureMessage: text("failure_message"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_owner_status_idx").on(table.ownerId, table.status),
    index("documents_department_status_idx").on(table.departmentId, table.status),
    index("documents_created_at_idx").on(table.createdAt),
    index("documents_checksum_idx").on(table.checksum),
  ],
);

export const documentStorageObjects = pgTable(
  "document_storage_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    provider: documentProviderEnum("provider").notNull(),
    providerObjectId: varchar("provider_object_id", { length: 255 }).notNull(),
    providerParentId: varchar("provider_parent_id", { length: 255 }),
    providerRevision: varchar("provider_revision", { length: 255 }),
    providerEtag: varchar("provider_etag", { length: 255 }),
    checksum: varchar("checksum", { length: 64 }),
    sizeBytes: integer("size_bytes"),
    status: documentStorageStatusEnum("status").default("uploaded").notNull(),
    providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>().notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_storage_objects_document_provider_unique").on(table.documentId, table.provider),
    uniqueIndex("document_storage_objects_provider_object_unique").on(table.provider, table.providerObjectId),
    index("document_storage_objects_status_idx").on(table.status),
  ],
);

export const documentLeads = pgTable(
  "document_leads",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.leadId] }), index("document_leads_lead_idx").on(table.leadId)],
);

export const documentClients = pgTable(
  "document_clients",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.clientId] }), index("document_clients_client_idx").on(table.clientId)],
);

export const documentDeals = pgTable(
  "document_deals",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.dealId] }), index("document_deals_deal_idx").on(table.dealId)],
);

export type Document = typeof documents.$inferSelect;
export type DocumentStorageObject = typeof documentStorageObjects.$inferSelect;
export type DocumentLead = typeof documentLeads.$inferSelect;
export type DocumentClient = typeof documentClients.$inferSelect;
export type DocumentDeal = typeof documentDeals.$inferSelect;

export const googleDriveConnectionStatusEnum = pgEnum("google_drive_connection_status", ["active", "revoked"]);

/**
 * Workspace-level Google Drive connection (personal Drive, drive.file scope) created through the existing
 * Auth.js Google sign-in. The refresh token is AES-256-GCM encrypted; access tokens are never stored.
 */
export const googleDriveConnections = pgTable(
  "google_drive_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectedByUserId: uuid("connected_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    googleAccountEmail: varchar("google_account_email", { length: 320 }).notNull(),
    googleSubject: varchar("google_subject", { length: 255 }),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    scopes: text("scopes").notNull(),
    folderId: varchar("folder_id", { length: 255 }),
    folderName: varchar("folder_name", { length: 255 }),
    folderVerifiedAt: timestamp("folder_verified_at", { withTimezone: true }),
    status: googleDriveConnectionStatusEnum("status").default("active").notNull(),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("google_drive_connections_single_active").on(table.status).where(sql`${table.status} = 'active'`),
    index("google_drive_connections_connected_by_idx").on(table.connectedByUserId),
  ],
);
