vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }), insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "artifact" }] }) }) }) } }));
import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/authorization/errors";

const mocks = vi.hoisted(() => ({
  getInvoice: vi.fn(),
  getQuotation: vi.fn(),
  upload: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/finance/server", () => ({
  invoiceService: { get: mocks.getInvoice },
  quotationService: { get: mocks.getQuotation },
  financeStorage: () => ({ upload: mocks.upload, verifyDestination: async () => true }),
}));

vi.mock("@/lib/authorization/server", () => ({
  requirePermission: mocks.requirePermission,
  authorizationErrorResponse: (error: unknown) => {
    const code = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "FORBIDDEN";
    return Response.json({ error: "You do not have permission to perform this action.", code }, { status: code === "UNAUTHENTICATED" ? 401 : 403 });
  },
}));

vi.mock("@/features/finance/documents/pdf", () => ({
  renderFinancialPdf: vi.fn(async () => ({
    body: Buffer.from("%PDF-1.3\n%%EOF\n"),
    checksum: "checksum",
    filename: "Nexyrium-Invoice-INV-2026-0001.pdf",
    mimeType: "application/pdf",
    rendererVersion: "test",
  })),
}));

const actor = { userId: "actor-1" };

function invoiceResult() {
  return {
    invoice: {
      id: "11111111-1111-4111-8111-111111111111",
      invoiceNumber: "INV-2026-0001",
      title: "Consulting services",
      status: "issued",
      currencyCode: "INR",
      issuedAt: new Date("2026-10-22T00:00:00.000Z"),
      createdAt: new Date("2026-10-22T00:00:00.000Z"),
      dueDate: "2026-11-21",
      paymentTerms: "Due within 30 days",
      notes: "Thank you.",
      subtotalMinor: "1500000",
      discountMinor: "0",
      taxMinor: "270000",
      totalMinor: "1770000",
      clientId: "22222222-2222-4222-8222-222222222222",
    },
    client: { id: "22222222-2222-4222-8222-222222222222", name: "Ada Lovelace", companyName: "Analytical Engines", email: "ada@example.com", phone: null, website: null },
    lines: [{ id: "33333333-3333-4333-8333-333333333333", description: "Consulting", quantity: "1.5", unitPriceMinor: "1000000", discountBps: 0, lineDiscountMinor: "0", taxBps: 1800, lineTaxMinor: "270000", lineTotalMinor: "1770000" }],
    allocations: [{ allocatedAmountMinor: "500000" }],
  };
}

describe("invoice PDF route", () => {
  it("returns a downloadable PDF for an authorized invoice", async () => {
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.getInvoice.mockResolvedValue(invoiceResult());
    const { POST } = await import("@/app/api/v1/invoices/[invoiceId]/pdf/route");

    const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ invoiceId: "11111111-1111-4111-8111-111111111111" }) });
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("Nexyrium-Invoice-INV-2026-0001.pdf");
    expect(Buffer.from(body).subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(mocks.getInvoice).toHaveBeenCalledWith(actor, "11111111-1111-4111-8111-111111111111");
  });

  it("returns a validation response for an invalid invoice ID", async () => {
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.getInvoice.mockClear();
    mocks.getInvoice.mockRejectedValue(new Error("should not read invalid ID"));
    const { POST } = await import("@/app/api/v1/invoices/[invoiceId]/pdf/route");

    const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ invoiceId: "not-a-uuid" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.getInvoice).not.toHaveBeenCalled();
  });

  it("enforces authorization before reading invoice data", async () => {
    mocks.requirePermission.mockRejectedValue(new AuthorizationError("FORBIDDEN", "forbidden"));
    mocks.getInvoice.mockClear();
    const { POST } = await import("@/app/api/v1/invoices/[invoiceId]/pdf/route");

    const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ invoiceId: "11111111-1111-4111-8111-111111111111" }) });

    expect(response.status).toBe(403);
    expect(mocks.getInvoice).not.toHaveBeenCalled();
  });
});

describe("explicit financial Drive save", () => {
  it.each(["issued", "paid"])("saves an %s invoice", async status => {
    const result = invoiceResult();
    result.invoice.status = status;
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.getInvoice.mockResolvedValue(result);
    mocks.upload.mockResolvedValue({ provider: "google_drive", objectId: "reserved" });
    const { POST } = await import("@/app/api/v1/invoices/[invoiceId]/pdf/route");
    const response = await POST(new Request("http://localhost/pdf?destination=drive"), { params: Promise.resolve({ invoiceId: result.invoice.id }) });
    expect(await response.json()).toEqual({ saved: true });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ category: "invoice" }));
  });
  it("downloads and independently saves a quotation PDF", async () => {
    const result = invoiceResult();
    mocks.getQuotation.mockResolvedValue({ quotation: { ...result.invoice, quotationNumber: "QT-1" }, lines: result.lines });
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.upload.mockClear().mockResolvedValue({ provider: "google_drive", objectId: "reserved" });
    const { POST } = await import("@/app/api/v1/quotations/[quotationId]/pdf/route");
    const params = Promise.resolve({ quotationId: result.invoice.id });
    const download = await POST(new Request("http://localhost/pdf"), { params });
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.upload).not.toHaveBeenCalled();
    const saved = await POST(new Request("http://localhost/pdf?destination=drive"), { params });
    expect(await saved.json()).toEqual({ saved: true });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ category: "quotation" }));
  });
});
