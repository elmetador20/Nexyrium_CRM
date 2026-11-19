import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createInvitation, createInvitationSchema, InvitationError } from "@/lib/auth/invitations";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.AUTH_INVITE);
    const input = createInvitationSchema.parse(await request.json());
    const authUrl = process.env.AUTH_URL ?? new URL(request.url).origin;
    const result = await createInvitation({ actor, input, origin: authUrl.replace(/\/$/, "") });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid invitation input.", code: "INVALID_INPUT" }, { status: 400 });
    }

    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }

    return authorizationErrorResponse(error);
  }
}
