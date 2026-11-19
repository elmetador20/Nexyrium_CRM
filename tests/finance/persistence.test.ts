import { describe, expect, it } from "vitest";

import { buildFinancialDocumentPayload } from "@/features/finance/shared/form-payload";
import { buildInvoiceWrite } from "@/features/invoices/persistence";
import { invoiceCreateSchema } from "@/features/invoices/schemas";

const clientId = "11111111-1111-4111-8111-111111111111";
const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  email: "finance@example.com",
  name: "Finance User",
  isActive: true,
  roles: ["finance"],
  permissions: ["invoices:create"],
  departmentIds: ["33333333-3333-4333-8333-333333333333"],
};

describe("invoice form and persistence mapping", () => {
  it("builds an API payload with minor-unit prices and basis points", () => {
    const payload = buildFinancialDocumentPayload({
      title: "Monthly support",
      notes: "",
      paymentTerms: "Due on receipt",
      dueDate: "2026-10-22",
      currencyCode: "inr",
      clientId,
      lines: [{ description: "Support", quantity: "1.5", unitPrice: "1000.50", discountRate: "5", taxRate: "18" }],
    });
    expect(payload).toMatchObject({ currencyCode: "INR", clientId, notes: null });
    expect(payload.lines[0]).toMatchObject({ unitPriceMinor: "100050", discountBps: 500, taxBps: 1800 });
  });

  it("keeps calculated totals and line values ready for database writes", () => {
    const input = invoiceCreateSchema.parse({ title: "Persistence", currencyCode: "INR", clientId, lines: [{ description: "Work", quantity: "1.5", unitPriceMinor: "100050", taxBps: 1800 }] });
    const write = buildInvoiceWrite(input, actor, clientId, { ownerId: actor.userId, departmentId: actor.departmentIds[0] ?? null });
    expect(write.invoice.subtotalMinor).toBe("150075");
    expect(write.invoice.taxMinor).toBe("27014");
    expect(write.invoice.totalMinor).toBe("177089");
    expect(write.lines("44444444-4444-4444-8444-444444444444")[0]).toMatchObject({ invoiceId: "44444444-4444-4444-8444-444444444444", unitPriceMinor: "100050", lineTotalMinor: "177089" });
  });
});
