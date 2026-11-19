import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { financeErrorResponse, financeValidationResponse } from "@/features/finance/shared/errors";
import { invoiceService } from "@/features/finance/server";
import { invoiceActionSchema, invoiceIssueSchema, invoiceVoidSchema } from "@/features/invoices/schemas";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errors(error: unknown) {
  if (error instanceof ZodError) return financeValidationResponse(error, "Invalid invoice action.")!;
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid invoice action.", code: "INVALID_INPUT" }, { status: 400 });
  return financeErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.INVOICES_READ);
    const { invoiceId } = await params;
    return NextResponse.json(await invoiceService.get(actor, invoiceId));
  } catch (error) {
    return errors(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const body = await request.json();
    const action = invoiceActionSchema.parse(body);
    const actor = await requirePermission(action.action === "void" ? PERMISSIONS.INVOICES_VOID : PERMISSIONS.INVOICES_ISSUE);
    const { invoiceId } = await params;
    if (action.action === "issue") {
      invoiceIssueSchema.parse(action.input ?? { issue: true });
      return NextResponse.json(await invoiceService.issue(actor, invoiceId, request.headers.get("x-correlation-id") ?? undefined));
    }

    const reason = action.input && typeof action.input === "object" && "reason" in action.input ? action.input.reason : action.reason;
    const input = invoiceVoidSchema.parse({ reason });
    return NextResponse.json(await invoiceService.void(actor, invoiceId, input.reason, request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    return errors(error);
  }
}
