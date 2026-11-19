import { NextResponse } from "next/server";

import { metaIntegrationService } from "@/features/integrations/meta";
import { MetaIntegrationError } from "@/features/integrations/meta/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof MetaIntegrationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await requirePermission(PERMISSIONS.INTEGRATIONS_META_READ);
    const { eventId } = await params;
    return NextResponse.json(await metaIntegrationService.getEvent(eventId));
  } catch (error) {
    return errorResponse(error);
  }
}
