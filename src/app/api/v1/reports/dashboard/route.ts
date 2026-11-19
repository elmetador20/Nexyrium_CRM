import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { reportsErrorResponse } from "@/features/reports/errors";
import { reportsService } from "@/features/reports/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.REPORTS_READ); return NextResponse.json(await reportsService.dashboard(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid report filters.", code: "INVALID_INPUT" }, { status: 400 }); return reportsErrorResponse(error) ?? authorizationErrorResponse(error); } }
