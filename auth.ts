import NextAuth from "next-auth";

import authConfig from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google" || profile?.email_verified !== true || !user.email) {
        return false;
      }

      try {
        const [{ getAuthEnv }, { getActiveActorByEmail, fillMissingUserName }, { recordAuditEvent }] = await Promise.all([
          import("@/lib/env"),
          import("@/lib/auth/identity"),
          import("@/lib/audit/service"),
        ]);

        getAuthEnv();
        const actor = await getActiveActorByEmail(user.email);

        if (!actor || actor.roles.length === 0) {
          return false;
        }

        // Invited users are created with only an email; take their name from Google on first sign-in.
        if (!actor.name?.trim()) {
          await fillMissingUserName(actor.userId, typeof profile?.name === "string" ? profile.name : user.name).catch(() => undefined);
        }

        await recordAuditEvent({
          actorUserId: actor.userId,
          action: "auth.sign_in",
          resourceType: "user",
          resourceId: actor.userId,
          outcome: "success",
          metadata: { provider: account.provider },
        });

        // "Connect Google Drive" reuses this sign-in with the drive.file scope and offline access.
        // Only then does Google return a refresh token with that scope; store it encrypted, server-side.
        // A failure here never blocks the sign-in itself.
        if (account.refresh_token) {
          try {
            const [{ hasDriveScope, saveConnectionFromOAuth }, { can }, { PERMISSIONS }] = await Promise.all([
              import("@/features/integrations/google-drive/connection"),
              import("@/lib/authorization/policy"),
              import("@/lib/authorization/permissions"),
            ]);
            if (hasDriveScope(account.scope) && can(actor, PERMISSIONS.SETTINGS_MANAGE)) {
              const connection = await saveConnectionFromOAuth({ userId: actor.userId, email: user.email, subject: account.providerAccountId ?? null, refreshToken: account.refresh_token, scopes: account.scope ?? "" });
              await recordAuditEvent({ actorUserId: actor.userId, action: "integration.google_drive.connect", resourceType: "google_drive_connection", resourceId: connection?.id ?? null, outcome: "success" });
            }
          } catch (error) {
            console.error("[auth] Google Drive connection could not be saved", { message: error instanceof Error ? error.name : "unknown" });
            await recordAuditEvent({ actorUserId: actor.userId, action: "integration.google_drive.connect", resourceType: "google_drive_connection", outcome: "failure" }).catch(() => undefined);
          }
        }

        return true;
      } catch (error) {
        // A database/network failure is not an access decision: tell the user the service is unreachable
        // instead of showing "not invited" (AccessDenied).
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined;
        console.error("[auth] sign-in check failed", { code, message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
        return "/login?error=ServiceUnavailable";
      }
    },
    async jwt({ token, user }) {
      const email = user?.email ?? token.email;
      const internalUserId = typeof token.internalUserId === "string" ? token.internalUserId : undefined;

      if (!email && !internalUserId) {
        return token;
      }

      const { getActiveActorByEmail, getActiveActorById } = await import("@/lib/auth/identity");
      const actor = internalUserId ? await getActiveActorById(internalUserId) : await getActiveActorByEmail(email!);

      if (!actor) {
        delete token.internalUserId;
        delete token.roles;
        delete token.permissions;
        delete token.departmentIds;
        token.authInvalid = true;
        return token;
      }

      token.internalUserId = actor.userId;
      token.roles = actor.roles;
      token.permissions = actor.permissions;
      token.departmentIds = actor.departmentIds;
      token.authInvalid = false;
      return token;
    },
    async session({ session, token }) {
      if (typeof token.internalUserId === "string") {
        session.user.id = token.internalUserId;
        session.user.internalUserId = token.internalUserId;
        session.user.roles = Array.isArray(token.roles) ? token.roles : [];
        session.user.permissions = Array.isArray(token.permissions) ? token.permissions : [];
        session.user.departmentIds = Array.isArray(token.departmentIds) ? token.departmentIds : [];
      }

      return session;
    },
  },
});
