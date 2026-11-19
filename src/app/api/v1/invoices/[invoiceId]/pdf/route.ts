import { ZodError } from "zod";

import { invoiceService } from "@/features/finance/server";
import type { FinancialPdfInput } from "@/features/finance/documents/pdf";
import { StorageError } from "@/lib/storage";
import { financeErrorResponse, financeValidationResponse } from "@/features/finance/shared/errors";
import { invoiceIdSchema } from "@/features/invoices/schemas";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { isAuthorizationError } from "@/lib/authorization/errors";

function paidMinor(allocations: Array<{ allocatedAmountMinor: string }>): string {
  return allocations.reduce((total, allocation) => total + BigInt(allocation.allocatedAmountMinor), BigInt(0)).toString();
}

function balanceDue(totalMinor: string, paid: string): string {
  const total = BigInt(totalMinor);
  const amountPaid = BigInt(paid);
  return (amountPaid >= total ? BigInt(0) : total - amountPaid).toString();
}

function errorResponse(error: unknown, invoiceId: string) {
  const errorCode = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : undefined;
  console.error("[invoice-pdf] generation_failed", {
    invoiceId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode,
  });
  return financeValidationResponse(error, "Invalid invoice ID.")
    ?? (error instanceof ZodError ? Response.json({ error: "Invalid invoice ID.", code: "INVALID_INPUT" }, { status: 400 }) : null)
    ?? financeErrorResponse(error)
    ?? (isAuthorizationError(error) ? authorizationErrorResponse(error) : Response.json({ error: "PDF generation failed. Please try again or contact an administrator.", code: "PDF_GENERATION_FAILED" }, { status: 500 }));
}

export async function POST(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  try {
    const actor = await requirePermission(PERMISSIONS.FINANCIAL_DOCUMENTS_DOWNLOAD);
    const validInvoiceId = invoiceIdSchema.parse(invoiceId);
    const result = await invoiceService.get(actor, validInvoiceId);
    const amountPaidMinor = paidMinor(result.allocations);
    const data: FinancialPdfInput = {
      recordId: invoiceId,
      documentType: "invoice",
      number: result.invoice.invoiceNumber,
      title: result.invoice.title,
      status: result.invoice.status,
      currencyCode: result.invoice.currencyCode,
      issueDate: result.invoice.issuedAt ?? result.invoice.createdAt,
      dueDate: result.invoice.dueDate,
      paymentTerms: result.invoice.paymentTerms,
      notes: result.invoice.notes,
      client: result.client,
      subtotalMinor: result.invoice.subtotalMinor,
      discountMinor: result.invoice.discountMinor,
      taxMinor: result.invoice.taxMinor,
      totalMinor: result.invoice.totalMinor,
      amountPaidMinor,
      balanceDueMinor: balanceDue(result.invoice.totalMinor, amountPaidMinor),
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
    };
    const artifacts = await import("@/features/finance/documents/artifact-service");
    if (new URL(_request.url).searchParams.get("destination") === "drive") {
      await requirePermission(PERMISSIONS.INVOICES_UPDATE);
      const { financeStorage } = await import("@/features/finance/server");
      try {
        await artifacts.generateFinancialPdf({ actorUserId: actor.userId, invoiceId, data, storage: financeStorage() });
      } catch (error) {
        if (error instanceof StorageError) return Response.json({ error: error.message, stage: "upload" }, { status: error.status });
        throw error;
      }
      return Response.json({ saved: true });
    }
    const rendered = await artifacts.generateDownload(data);
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
    return errorResponse(error, invoiceId);
  }
}
