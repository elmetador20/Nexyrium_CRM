# Meta Lead Ads integration

Module 5 adds a server-side Meta Lead Ads webhook receiver. It is intentionally
not activated automatically and does not create a Meta app, request permissions,
store tokens, or subscribe a Page.

## Required server environment

Set these values in `.env.local` or the deployment secret manager. Never prefix
them with `NEXT_PUBLIC_`, commit them, or expose them in logs:

- `META_APP_ID` — optional display metadata for the admin status page.
- `META_APP_SECRET` — the Meta app secret used to verify `X-Hub-Signature-256`.
- `META_WEBHOOK_VERIFY_TOKEN` — a private value entered into the Meta webhook
  subscription and checked during the GET verification challenge.
- `META_GRAPH_API_VERSION` — the Graph API version selected for the Meta app.
- `META_PAGE_ACCESS_TOKEN` — the Page access token used in the server-side lead
  retrieval request. It is sent as an Authorization header, never stored in the
  database, and never returned by the status API.
- `META_PAGE_ID` — optional operator metadata for the configured Page.
- `META_DEFAULT_OWNER_ID` and `META_DEFAULT_DEPARTMENT_ID` — optional UUIDs used
  by the verified integration when assigning newly created leads.
- `META_WEBHOOK_MAX_BYTES` — maximum accepted webhook body size.

Import limits are controlled by `LEAD_IMPORT_MAX_FILE_BYTES`,
`LEAD_IMPORT_MAX_ROWS`, and `LEAD_IMPORT_PREVIEW_ROWS`.

## Required Meta Business setup

Before activation, an administrator must complete the current Meta setup for the
selected app and Page:

1. Create/select the Meta app in Meta for Developers and keep its App Secret
   server-side.
2. Give the app access to the Facebook Page that owns the Lead Ad form.
3. Request and approve the Page/Lead Ads permissions Meta currently requires
   for lead retrieval and Page webhook subscriptions. The exact approval and
   permission names can change by Meta product/API version; confirm them in the
   current Meta Lead Ads and Webhooks documentation before production use.
4. Configure the HTTPS callback URL as:

   ```text
   https://<deployed-origin>/api/v1/webhooks/meta
   ```

5. Enter the exact `META_WEBHOOK_VERIFY_TOKEN` as the webhook Verify Token and
   subscribe the Page to the `leadgen` field.
6. Configure a Page access token with the lead-retrieval capability and test it
   against the selected Graph API version.

The GET endpoint implements the documented `hub.mode`, `hub.verify_token`, and
`hub.challenge` handshake. POST requests validate the raw body with the
`X-Hub-Signature-256` HMAC before parsing JSON. Invalid signatures are persisted
as rejected integration events using only a payload hash and safe metadata.

## Processing and safety

- A Meta `leadgen_id` is the provider identity and becomes the source identifier
  passed to the unified lead-intake service.
- The integration never inserts into `leads` directly. It calls
  `ingestExternal()` on the Module 4 service after verification and lead
  retrieval.
- Meta deliveries are persisted in `meta_integration_events` and repeated
  deliveries are marked duplicate rather than creating a second lead.
- Graph retrieval failures remain visible as failed events and can be retried
  from the protected admin status page.
- Logs and audit metadata contain provider IDs, status, error codes, and counts;
  they do not contain access tokens, signatures, raw request bodies, or lead
  contact fields.

## Admin visibility

Administrators can inspect `/settings/integrations/meta` after signing in with
the `integrations:meta:read` permission. The page shows whether webhook
verification and lead retrieval are configured, recent event status, rejected
signatures, failures, and a retry action for failed lead events.

No real webhook is deployed or activated as part of this module. Use the
synthetic tests and a controlled Meta test Page before requesting approval for
any external activation.

## Official references used for this adapter

- Meta Graph API Webhooks: https://developers.facebook.com/docs/graph-api/webhooks/
- Meta Lead Ads: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/
- Meta's official Lead Ads webhook sample: https://github.com/fbsamples/lead-ads-webhook-sample

Re-check the current Meta documentation for permission names, API-version
support, Page subscription steps, and token requirements immediately before
production activation.
