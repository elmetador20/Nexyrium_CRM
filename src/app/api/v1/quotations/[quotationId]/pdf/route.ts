import { ZodError } from "zod";

import { quotationService } from "@/features/finance/server";
import { renderFinancialPdf } from "@/features/finance/documents/pdf";
import { financeErrorResponse, financeValidationResponse } from "@/features/finance/shared/errors";
import { quotationIdSchema } from "@/features/quotations/schemas";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { isAuthorizationError } from "@/lib/authorization/errors";

function errorResponse(error: unknown, quotationId: string) {
  console.error("[quotation-pdf] generation_failed", {
    quotationId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : undefined,
  });
  return financeValidationResponse(error, "Invalid quotation ID.")
    ?? (error instanceof ZodError ? Response.json({ error: "Invalid quotation ID.", code: "INVALID_INPUT" }, { status: 400 }) : null)
    ?? financeErrorResponse(error)
    ?? (isAuthorizationError(error) ? authorizationErrorResponse(error) : Response.json({ error: "PDF generation failed. Please try again or contact an administrator.", code: "PDF_GENERATION_FAILED" }, { status: 500 }));
}

export async function POST(_request: Request, { params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  try {
    const actor = await requirePermission(PERMISSIONS.FINANCIAL_DOCUMENTS_DOWNLOAD);
    const validQuotationId = quotationIdSchema.parse(quotationId);
    const result = await quotationService.get(actor, validQuotationId);
    const rendered = await renderFinancialPdf({
      documentType: "quotation",
      number: result.quotation.quotationNumber,
      title: result.quotation.title,
      status: result.quotation.status,
      currencyCode: result.quotation.currencyCode,
      issueDate: result.quotation.issuedAt ?? result.quotation.createdAt,
      dueDate: result.quotation.dueDate,
      paymentTerms: result.quotation.paymentTerms,
      notes: result.quotation.notes,
      subtotalMinor: result.quotation.subtotalMinor,
      discountMinor: result.quotation.discountMinor,
      taxMinor: result.quotation.taxMinor,
      totalMinor: result.quotation.totalMinor,
      lines: result.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountBps: line.discountBps,
        lineDiscountMinor: line.lineDiscountMinor,
        taxBps: line.taxBps,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    });
    return new Response(new Uint8Array(rendered.body), {
      status: 200,
      headers: {
        "Content-Type": rendered.mimeType,
        "Content-Length": String(rendered.body.byteLength),
        "Content-Disposition": `attachment; filename="${rendered.filename}"; filename*=UTF-8''${encodeURIComponent(rendered.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, quotationId);
  }
}
