import { describe, expect, it } from "vitest";

import { renderFinancialPdf } from "@/features/finance/documents/pdf";

function invoiceInput(overrides: Record<string, unknown> = {}) {
  return {
    documentType: "invoice" as const,
    number: "INV-2026-0001",
    title: "Consulting services",
    status: "issued",
    currencyCode: "INR",
    issueDate: "2026-10-22",
    dueDate: "2026-11-21",
    paymentTerms: "Due within 30 days",
    notes: "Thank you for your business.",
    client: { name: "Ada Lovelace", companyName: "Analytical Engines", email: "ada@example.com", phone: "+1 555 010 1234" },
    subtotalMinor: "1500000",
    discountMinor: "0",
    taxMinor: "270000",
    totalMinor: "1770000",
    amountPaidMinor: "500000",
    balanceDueMinor: "1270000",
    lines: [{ description: "Strategic consulting and delivery planning", quantity: "1.5", unitPriceMinor: "1000000", discountBps: 0, lineDiscountMinor: "0", taxBps: 1800, lineTaxMinor: "270000", lineTotalMinor: "1770000" }],
    ...overrides,
  };
}

function pageContentStreams(body: Buffer): string[] {
  return [...body.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => match[1])
    .filter((stream) => stream.includes("1 0 0 -1 0 841.89 cm"));
}

describe("premium financial PDF renderer", () => {
  it("renders a branded invoice with INR, client data, totals, and a safe filename", async () => {
    const rendered = await renderFinancialPdf(invoiceInput());
    const text = rendered.body.toString("latin1");

    expect(rendered.filename).toBe("Nexyrium-Invoice-INV-2026-0001.pdf");
    expect(rendered.mimeType).toBe("application/pdf");
    expect(rendered.body.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(rendered.body.subarray(-7).toString("latin1")).toContain("%%EOF");
    expect(text).toContain("Nexyrium");
    expect(text).toContain("INV-2026-0001");
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Consulting services");
    expect(text).toContain("INR");
    expect(text).toContain("total 1770000 minor units");
    expect(text).toContain("/Subtype /Image");
  });

  it("paginates long invoices and tolerates a missing optional client", async () => {
    const rendered = await renderFinancialPdf(invoiceInput({
      client: null,
      lines: Array.from({ length: 48 }, (_, index) => ({
        description: `Long line item ${index + 1}: ${"Detailed delivery scope ".repeat(12)}`,
        quantity: "1",
        unitPriceMinor: "1000",
        discountBps: 500,
        lineDiscountMinor: "50",
        taxBps: 1800,
        lineTaxMinor: "171",
        lineTotalMinor: "1121",
      })),
    }));
    const pageCount = (rendered.body.toString("latin1").match(/\/Type \/Page(?!s)\b/g) ?? []).length;
    const contentStreams = pageContentStreams(rendered.body);

    expect(rendered.body.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pageCount).toBeGreaterThan(1);
    expect(contentStreams).toHaveLength(pageCount);
    const lineItemPages = contentStreams.filter((stream) => stream.includes("4445534352495054494f4e"));
    expect(lineItemPages.length).toBeGreaterThan(1);
    expect(lineItemPages.every((stream) => stream.includes("4c6f6e6720"))).toBe(true);
  });
});
