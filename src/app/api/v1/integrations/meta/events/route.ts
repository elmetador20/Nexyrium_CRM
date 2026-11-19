import { NextResponse } from "next/server";

import { metaIntegrationService } from "@/features/integrations/meta";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) {
  try {
    await requirePermission(PERMISSIONS.INTEGRATIONS_META_READ);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "20") || 20));
    return NextResponse.json(await metaIntegrationService.status({ page, pageSize, status: params.get("status") ?? undefined }));
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
