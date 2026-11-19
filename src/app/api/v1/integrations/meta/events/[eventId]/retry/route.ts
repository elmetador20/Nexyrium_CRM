import { NextResponse } from "next/server";

import { metaIntegrationService } from "@/features/integrations/meta";
import { MetaIntegrationError } from "@/features/integrations/meta/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await requirePermission(PERMISSIONS.INTEGRATIONS_META_MANAGE);
    const { eventId } = await params;
    const result = await metaIntegrationService.retry(eventId, request.headers.get("x-correlation-id") ?? crypto.randomUUID());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MetaIntegrationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
