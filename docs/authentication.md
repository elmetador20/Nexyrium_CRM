# Authentication and authorization setup

## Auth.js version and provider

This project uses `next-auth@5.0.0-beta.32`, the Auth.js v5 API compatible with
the existing Next.js 16 installation. The provider is Google OAuth because it
supports verified organization identities without adding password storage or a
hardcoded admin credential.

The flow is invite-only:

1. An authorized internal user creates an invitation through the protected
   `POST /api/v1/auth/invitations` endpoint.
2. The invitation contains a random token. Only its SHA-256 hash is stored.
3. The invitee opens `/invite?token=...` and accepts the invitation.
4. Acceptance creates or activates the internal user, assigns the approved
   role/department, and audits the event.
5. The invitee signs in with the invited, verified Google email.
6. Auth.js links the OAuth identity to the internal user by normalized email.

No arbitrary public account creation is enabled. A Google account without an
accepted invitation is rejected by the Auth.js `signIn` callback.

## Required environment variables

Set these in `.env.local` or the deployment secret manager. Never commit real
values and never use `NEXT_PUBLIC_` for them:

```dotenv
AUTH_SECRET=<random value of at least 32 characters>
AUTH_URL=https://your-deployment.example.com
AUTH_TRUST_HOST=false
AUTH_GOOGLE_ID=<Google OAuth client ID>
AUTH_GOOGLE_SECRET=<Google OAuth client secret>
```

Generate `AUTH_SECRET` with `npx auth secret` or another approved cryptographic
secret generator. The example value is intentionally not a usable production
secret.

`AUTH_URL` should be the canonical deployment URL. Set `AUTH_TRUST_HOST=true`
only when the deployment is behind a trusted reverse proxy that supplies the
forwarded host headers.

## Google Cloud Console setup

Create an OAuth 2.0 Web application client and configure the authorized
redirect URI:

```text
https://<deployment-host>/api/auth/callback/google
```

For local development, also add:

```text
http://localhost:3000/api/auth/callback/google
```

Restrict the OAuth consent screen and test users according to Nexyrium's
organization policy. OAuth provider access does not replace application RBAC;
the internal `users`, `user_roles`, and `role_permissions` records remain the
authorization source of truth.

## Bootstrap procedure

The first authorized operator must apply the migrations, seed the approved
role/permission records, create an internal user or invitation through a
controlled operational process, and verify the user's role assignment. Do not
create a production password or bypass the invitation endpoint.

## Protected boundaries

- `src/app/(authenticated)/layout.tsx` requires an active internal user.
- `proxy.ts` provides an early unauthenticated redirect/401 response.
- API handlers must still call the server-side authorization helpers; proxy
  checks are not sufficient.
- `src/lib/authorization/server.ts` re-resolves the actor from PostgreSQL on
  protected access, so deactivation and role changes take effect server-side.
- Role replacements, invitation creation/acceptance, and successful sign-ins
  write centralized audit events.
