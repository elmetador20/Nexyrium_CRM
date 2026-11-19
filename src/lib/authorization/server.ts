import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import { getActiveActorById } from "@/lib/auth/identity";

import { AuthorizationError } from "./errors";
import { can, canAccessRecord, type AuthorizationActor, type RecordScope, type ScopedRecord } from "./policy";
import type { Permission } from "./permissions";

/** Resolved once per request (layout, page and components share it) to avoid repeated database round trips. */
export const getSessionActor = cache(async function getSessionActor(): Promise<AuthorizationActor | null> {
  const session = await auth();
  const internalUserId = session?.user?.internalUserId;
  const image = session?.user?.image;

  if (!internalUserId) {
    return null;
  }

  const actor = await getActiveActorById(internalUserId);
  if (actor) {
    return { ...actor, image: image ?? null };
  }
  return null;
});

export async function requireActor(): Promise<AuthorizationActor> {
  const actor = await getSessionActor();

  if (!actor) {
    throw new AuthorizationError("UNAUTHENTICATED", "Authentication is required.");
  }

  if (!actor.isActive) {
    throw new AuthorizationError("INACTIVE_USER", "This user is inactive.");
  }

  return actor;
}

export async function requirePageActor(): Promise<AuthorizationActor> {
  try {
    return await requireActor();
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }

    redirect("/forbidden");
  }
}

export async function requirePermission(permission: Permission | string): Promise<AuthorizationActor> {
  const actor = await requireActor();

  if (!can(actor, permission)) {
    throw new AuthorizationError("FORBIDDEN", "You do not have permission to perform this action.");
  }

  return actor;
}

export async function requirePagePermission(permission: Permission | string): Promise<AuthorizationActor> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }

    redirect("/forbidden");
  }
}

export async function requireRecordPermission(
  permission: Permission | string,
  record: ScopedRecord,
  scope: RecordScope = "owner",
): Promise<AuthorizationActor> {
  const actor = await requireActor();

  if (!canAccessRecord(actor, permission, record, scope)) {
    throw new AuthorizationError("RECORD_FORBIDDEN", "You do not have access to this record.");
  }

  return actor;
}

export function authorizationErrorResponse(error: unknown): Response {
  if (!(error instanceof AuthorizationError)) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }

  const status = error.code === "UNAUTHENTICATED" || error.code === "INACTIVE_USER" ? 401 : 403;
  return Response.json({ error: error.message, code: error.code }, { status });
}
