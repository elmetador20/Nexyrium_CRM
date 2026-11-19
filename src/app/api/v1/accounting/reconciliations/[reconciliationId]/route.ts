import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { reconciliationService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(_request: Request, { params }: { params: Promise<{ reconciliationId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_READ); const { reconciliationId } = await params; return NextResponse.json(await reconciliationService.get(actor, reconciliationId)); } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
