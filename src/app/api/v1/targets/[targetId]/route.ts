import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { targetErrorResponse } from "@/features/targets/errors";
import { targetService } from "@/features/targets/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ targetId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.REPORTS_MANAGE); const { targetId } = await params; return NextResponse.json(await targetService.update(actor, targetId, await request.json(), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid target input.", code: "INVALID_INPUT" }, { status: 400 }); return targetErrorResponse(error) ?? authorizationErrorResponse(error); } }
