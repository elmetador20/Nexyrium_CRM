import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { targetErrorResponse } from "@/features/targets/errors";
import { targetService } from "@/features/targets/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.REPORTS_READ); return NextResponse.json(await targetService.list(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid target filters.", code: "INVALID_INPUT" }, { status: 400 }); return targetErrorResponse(error) ?? authorizationErrorResponse(error); } }
export async function POST(request: Request) { try { const actor = await requirePermission(PERMISSIONS.REPORTS_MANAGE); return NextResponse.json(await targetService.create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 }); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid target input.", code: "INVALID_INPUT" }, { status: 400 }); return targetErrorResponse(error) ?? authorizationErrorResponse(error); } }
