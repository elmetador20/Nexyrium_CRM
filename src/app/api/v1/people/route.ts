import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { peopleErrorResponse } from "@/features/people/errors";
import { peopleService } from "@/features/people/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.PEOPLE_READ); return NextResponse.json(await peopleService.list(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid people filters.", code: "INVALID_INPUT" }, { status: 400 }); return peopleErrorResponse(error) ?? authorizationErrorResponse(error); } }
