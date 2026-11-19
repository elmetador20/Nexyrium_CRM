# Private Google Drive document storage

Documents and expense receipts use the Google Drive API v3 through a provider-neutral
storage adapter (`StorageAdapter`). CRM/document services never import the Google SDK or
receive Google credentials.

## Authentication model

Drive access reuses the existing Auth.js v5 Google provider (`AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET`) and its existing callback `/api/auth/callback/google`. Normal
sign-in still asks only for identity. An administrator (`settings:manage`) clicks
**Settings → Integrations → Google Drive → Connect Google Drive**, which re-runs the same
Google sign-in with:

```text
scope=openid email profile https://www.googleapis.com/auth/drive.file
access_type=offline   prompt=consent select_account   include_granted_scopes=true
```

The Auth.js `signIn` callback stores the returned refresh token in
`google_drive_connections`, encrypted with AES-256-GCM (`src/lib/crypto/token-cipher.ts`,
key `GOOGLE_TOKEN_ENCRYPTION_KEY`, purpose-bound additional authenticated data). One
connection is active at a time. Access tokens are never persisted; the server refreshes
them in memory. A revoked or expired grant (`invalid_grant`) marks the connection revoked
and the UI asks for a reconnect. Failing to store the token never blocks sign-in.

The Google account used to connect must be an invited, active Nexyrium user with
`settings:manage`, because connecting goes through the normal sign-in checks.

### Folder authorization under drive.file

`drive.file` only covers files the app created or items the user explicitly opened with the
app. An existing folder such as "Nexyrium OS Receipts" is therefore not visible by ID alone.

1. **Check configured folder** tries `GOOGLE_DRIVE_FOLDER_ID` directly.
2. If Google answers "not found", **Choose folder in Google Drive** opens Google Picker. Picking
   the folder grants the app access to that folder only; the server verifies it can add files
   (`capabilities.canAddChildren`) before saving it.

The Picker receives a short-lived (about 1 hour) drive.file access token from
`GET /api/v1/integrations/google-drive/picker-token` (settings:manage only, `no-store`). The
refresh token and client secret never leave the server. Uploads are refused until a folder
has been verified.

## Environment variables

Server-only; never use a `NEXT_PUBLIC_` prefix:

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — the existing OAuth web client.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — 32 random bytes, base64. Changing it makes the stored token
  unreadable; reconnect Drive afterwards.
- `GOOGLE_PICKER_API_KEY` — browser API key restricted to the Google Picker API and the app
  origin (HTTP referrer). It is not a secret, but keep it restricted.
- `GOOGLE_CLOUD_PROJECT_NUMBER` — numeric Cloud project number (the Picker `appId`).
- `GOOGLE_DRIVE_FOLDER_ID` — folder to try first.
- `GOOGLE_DRIVE_MAX_FILE_BYTES`, `GOOGLE_DRIVE_ALLOWED_MIME_TYPES`,
  `GOOGLE_DRIVE_SHARED_DRIVE_ID` (optional). Empty values are treated as unset.

Expense receipts additionally enforce PDF/JPEG/PNG/WebP, at most 10 MB, and content sniffing
of the leading bytes (`src/features/accounting/receipt-file.ts`).

## Google Cloud setup

1. In the OAuth client's project, enable the **Google Drive API** and the **Google Picker API**.
2. OAuth consent screen → Data access: add `https://www.googleapis.com/auth/drive.file`.
   While the app is in *Testing*, add your Google account as a test user. Refresh tokens of
   apps in Testing expire after 7 days (reconnect, or publish the app; drive.file is a
   non-sensitive scope).
3. Keep the JavaScript origin `http://localhost:3000` and redirect URI
   `http://localhost:3000/api/auth/callback/google` (no new redirect URI is needed).
4. Create the Picker API key, restricted to the Picker API and referrer
   `http://localhost:3000/*`.

## Application behavior

- Every document has a PostgreSQL record with a safe display filename, detected MIME type,
  size, checksum, lifecycle status, uploader, owner/department scope, and timestamps.
- Drive file IDs, parent folder, revision and metadata (including `webViewLink`) are stored in
  `document_storage_objects`; expense receipts link through `expense_receipts`.
- Every receipt/document operation re-checks the expense or business-record scope.
- Files are never made public by the application.
- Content routes re-authorize and return private, `no-store`, `nosniff` responses; receipts are
  previewed in-app through `GET /api/v1/expenses/:id/receipts/:documentId/content`.
- Failed provider uploads leave a `failed` document record for visibility. A provider object
  created before a metadata failure is cleaned up on a best-effort basis.
- The UI never displays OAuth secrets, refresh tokens or access tokens. Receipts show an
  "Open in Drive" link (the file's Drive `webViewLink`, which only works for people who can see
  the file in Drive).

## Official Google references

- Drive API scopes: `developers.google.com/workspace/drive/api/guides/api-specific-auth`
- Google Picker: `developers.google.com/workspace/drive/picker/guides/overview`
- Uploads (resumable): `developers.google.com/workspace/drive/api/guides/manage-uploads`
- OAuth for web server apps: `developers.google.com/identity/protocols/oauth2/web-server`

This repository does not claim an end-to-end Google Drive connection until a real
upload/download smoke test has succeeded against the configured account and folder.
