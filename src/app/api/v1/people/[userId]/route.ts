import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { peopleErrorResponse } from "@/features/people/errors";
import { peopleService } from "@/features/people/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.PEOPLE_READ); const { userId } = await params; return NextResponse.json(await peopleService.get(actor, userId)); } catch (error) { return peopleErrorResponse(error) ?? authorizationErrorResponse(error); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.PEOPLE_MANAGE); const { userId } = await params; return NextResponse.json(await peopleService.update(actor, userId, await request.json(), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid people profile input.", code: "INVALID_INPUT" }, { status: 400 }); return peopleErrorResponse(error) ?? authorizationErrorResponse(error); } }
