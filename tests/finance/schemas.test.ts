import { describe, expect, it } from "vitest";

import { invoiceActionSchema, invoiceCreateSchema } from "@/features/invoices/schemas";
import { quotationCreateSchema } from "@/features/quotations/schemas";

const clientId = "11111111-1111-4111-8111-111111111111";

describe("finance document schemas", () => {
  it("normalizes currency and accepts precise line inputs", () => {
    const quotation = quotationCreateSchema.parse({
      title: "Implementation",
      currencyCode: "inr",
      clientId,
      lines: [{ description: "Discovery", quantity: "1.5", unitPriceMinor: "100000", discountBps: 500, taxBps: 1800 }],
    });
    expect(quotation.currencyCode).toBe("INR");
    expect(quotation.lines[0]?.quantity).toBe("1.5");
  });

  it("rejects invalid money, quantity, and percentage inputs", () => {
    expect(() => quotationCreateSchema.parse({ title: "Bad", currencyCode: "INR", clientId, lines: [{ description: "x", quantity: "1.1234567", unitPriceMinor: "10" }] })).toThrow();
    expect(() => quotationCreateSchema.parse({ title: "Bad", currencyCode: "INR", clientId, lines: [{ description: "x", quantity: "1", unitPriceMinor: "10.5" }] })).toThrow();
    expect(() => invoiceCreateSchema.parse({ title: "Bad", currencyCode: "INR", clientId, lines: [{ description: "x", quantity: "1", unitPriceMinor: "10", taxBps: 10001 }] })).toThrow();
    expect(() => invoiceCreateSchema.parse({ title: "Bad", currencyCode: "INR", clientId, lines: [{ description: "x", quantity: "0", unitPriceMinor: "10" }] })).toThrow();
    expect(() => invoiceCreateSchema.parse({ title: "Bad", currencyCode: "INR", clientId, lines: [{ description: "x", quantity: "1", unitPriceMinor: "0" }] })).toThrow();
  });

  it("normalizes blank optional IDs to null for direct API payloads", () => {
    const invoice = invoiceCreateSchema.parse({
      title: "Optional links",
      currencyCode: "usd",
      clientId,
      dealId: "",
      projectId: "",
      quotationId: "",
      ownerId: "",
      departmentId: "",
      lines: [{ description: "Support", quantity: "1.25", unitPriceMinor: "1000", discountBps: "500", taxBps: "1800" }],
    });
    expect(invoice.dealId).toBeNull();
    expect(invoice.projectId).toBeNull();
    expect(invoice.quotationId).toBeNull();
    expect(invoice.lines[0]?.discountBps).toBe(500);
  });

  it("validates issue and void action payloads", () => {
    expect(invoiceActionSchema.parse({ action: "issue", input: { issue: true } }).action).toBe("issue");
    expect(invoiceActionSchema.parse({ action: "void", input: { reason: "Duplicate invoice" } }).action).toBe("void");
    expect(() => invoiceActionSchema.parse({ action: "void", input: { reason: "" } })).toThrow();
    expect(() => invoiceCreateSchema.parse({ title: "Bad date", currencyCode: "INR", clientId, dueDate: "2026-02-30", lines: [{ description: "x", quantity: "1", unitPriceMinor: "10" }] })).toThrow();
  });
});
