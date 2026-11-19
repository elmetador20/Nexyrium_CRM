import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, sql, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLogs,
  departments,
  invitations,
  roles,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit/service";
import { normalizeEmail } from "@/lib/auth/identity";
import { AuthorizationError } from "@/lib/authorization/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can, type AuthorizationActor } from "@/lib/authorization/policy";

export const createInvitationSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  roleId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export class InvitationError extends Error {
  constructor(
    public readonly code: "INVALID" | "EXPIRED" | "ALREADY_USED" | "CONFIGURATION",
    message: string,
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation({
  actor,
  input,
  origin,
}: {
  actor: AuthorizationActor;
  input: CreateInvitationInput;
  origin: string;
}) {
  const [blocked] = await db.select({id: users.id}).from(users).where(and(eq(users.isActive, false), sql`lower(${users.email}) = ${normalizeEmail(input.email)}`)).limit(1);
  if (blocked) throw new InvitationError("INVALID", "Workspace access for this account has been removed.");
  const [role] = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (!role) {
    throw new InvitationError("INVALID", "The selected role is invalid.");
  }

  if (["owner_admin", "founder"].includes(role.slug) && !can(actor, PERMISSIONS.AUTH_ROLE_MANAGE)) {
    throw new AuthorizationError("FORBIDDEN", "You cannot invite an owner or founder.");
  }

  if (input.departmentId) {
    const [department] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, input.departmentId))
      .limit(1);
    if (!department) {
      throw new InvitationError("INVALID", "The selected department is invalid.");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const [invitation] = await db
    .insert(invitations)
    .values({
      email: input.email,
      tokenHash: hashInvitationToken(token),
      roleId: input.roleId,
      departmentId: input.departmentId,
      invitedByUserId: actor.userId,
      expiresAt,
    })
    .returning({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt });

  if (!invitation) {
    throw new InvitationError("CONFIGURATION", "The invitation could not be created.");
  }

  await recordAuditEvent({
    actorUserId: actor.userId,
    action: "auth.invitation.create",
    resourceType: "invitation",
    resourceId: invitation.id,
    outcome: "success",
    metadata: { invitedEmailDomain: input.email.split("@")[1] },
  });

  return {
    ...invitation,
    invitationUrl: `${origin}/invite?token=${encodeURIComponent(token)}`,
  };
}

export async function getInvitationPreview(token: string) {
  if (!token || token.length < 40) {
    return null;
  }

  const [invitation] = await db
    .select({ email: invitations.email, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashInvitationToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .limit(1);

  if (!invitation || invitation.expiresAt <= new Date()) {
    return null;
  }

  return invitation;
}

export async function acceptInvitation(token: string) {
  if (!token || token.length < 40) {
    throw new InvitationError("INVALID", "This invitation is invalid or expired.");
  }

  const tokenHash = hashInvitationToken(token);

  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!invitation) {
      throw new InvitationError("EXPIRED", "This invitation is invalid or expired.");
    }

    const normalizedEmail = normalizeEmail(invitation.email);
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1).for("update");
    if (existingUser && !existingUser.isActive) throw new InvitationError("INVALID", "Workspace access for this account has been removed.");

    const user = existingUser
      ? existingUser
      : (
          await tx
            .insert(users)
            .values({ email: normalizedEmail, isActive: true })
            .returning()
        )[0];

    if (!user) {
      throw new InvitationError("CONFIGURATION", "The invited user could not be created.");
    }


    await tx.insert(userRoles).values({ userId: user.id, roleId: invitation.roleId }).onConflictDoNothing();

    if (invitation.departmentId) {
      await tx
        .insert(userDepartments)
        .values({ userId: user.id, departmentId: invitation.departmentId, isPrimary: true })
        .onConflictDoNothing();
    }

    await tx.insert(auditLogs).values({
      actorUserId: user.id,
      action: "auth.invitation.accept",
      resourceType: "invitation",
      resourceId: invitation.id,
      outcome: "success",
      metadata: { invitedEmailDomain: normalizedEmail.split("@")[1] },
    });

    return { email: normalizedEmail };
  });
}
