-- Provision on a separate control database. Workspace business records stay in
-- dedicated databases. Connection references identify secrets held by the host.
BEGIN;
CREATE SCHEMA nexyrium_control;
REVOKE ALL ON SCHEMA nexyrium_control FROM PUBLIC;

CREATE TABLE nexyrium_control.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  logo_path text,
  primary_color text NOT NULL DEFAULT '#245B45' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TABLE nexyrium_control.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES nexyrium_control.organizations(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  hostname text NOT NULL UNIQUE CHECK (hostname = lower(hostname) AND length(trim(hostname)) > 0),
  database_secret_ref text NOT NULL UNIQUE CHECK (length(trim(database_secret_ref)) > 0),
  active boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id,slug)
);

CREATE TABLE nexyrium_control.workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES nexyrium_control.workspaces(id) ON DELETE RESTRICT,
  google_subject text NOT NULL CHECK (length(trim(google_subject)) > 0),
  workspace_user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id,google_subject),
  UNIQUE (workspace_id,workspace_user_id)
);

REVOKE ALL ON ALL TABLES IN SCHEMA nexyrium_control FROM PUBLIC;
COMMIT;
