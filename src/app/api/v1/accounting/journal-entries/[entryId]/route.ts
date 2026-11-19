import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { journalEntryService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(_request: Request, { params }: { params: Promise<{ entryId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_READ); const { entryId } = await params; return NextResponse.json(await journalEntryService.get(actor, entryId)); } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
