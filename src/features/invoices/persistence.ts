import type { AuthorizationActor } from "@/lib/authorization/policy";
import { calculateLine, calculateTotals } from "@/features/finance/shared/money";
import type { InvoiceCreateInput } from "./schemas";

export function buildInvoiceWrite(input: InvoiceCreateInput, actor: AuthorizationActor, clientId: string, assignment: { ownerId: string; departmentId: string | null }) {
  const lineValues = input.lines.map((line, position) => ({
    ...line,
    position,
    ...calculateLine(line),
  }));

  return {
    invoice: {
      title: input.title,
      notes: input.notes ?? null,
      paymentTerms: input.paymentTerms ?? null,
      dueDate: input.dueDate?.toISOString().slice(0, 10) ?? null,
      currencyCode: input.currencyCode,
      clientId,
      dealId: input.dealId ?? null,
      projectId: input.projectId ?? null,
      quotationId: input.quotationId ?? null,
      ownerId: assignment.ownerId,
      departmentId: assignment.departmentId,
      createdByUserId: actor.userId,
      ...calculateTotals(input.lines),
    },
    lines: (invoiceId: string) => lineValues.map((line) => ({
      invoiceId,
      position: line.position,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountBps: line.discountBps,
      taxBps: line.taxBps,
      lineSubtotalMinor: line.grossMinor,
      lineDiscountMinor: line.discountMinor,
      lineTaxMinor: line.taxMinor,
      lineTotalMinor: line.totalMinor,
    })),
  };
}
