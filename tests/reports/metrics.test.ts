import { describe, expect, it } from "vitest";

import { calculateReceivables, firstTouchLeadSourceMetrics } from "@/features/reports/shared/metrics";
import { normalizeReportFilters } from "@/features/reports/shared/filters";

describe("dashboard report metrics", () => {
  it("counts a canonical lead once and uses deterministic first-touch source attribution", () => {
    const source = firstTouchLeadSourceMetrics({ periodFrom: "2026-10-01", periodTo: "2026-10-31", asOfDate: "2026-10-21", leads: [{ id: "lead-1", status: "qualified", createdAt: "2026-10-02T10:00:00.000Z", convertedAt: "2026-10-20T10:00:00.000Z" }, { id: "lead-2", status: "new", createdAt: "2026-10-03T10:00:00.000Z", convertedAt: null }], histories: [{ id: "h-2", leadId: "lead-1", source: "changed-source", recordedAt: "2026-10-02T12:00:00.000Z" }, { id: "h-1", leadId: "lead-1", source: "referral", recordedAt: "2026-10-02T11:00:00.000Z" }, { id: "h-3", leadId: "lead-2", source: "referral", recordedAt: "2026-10-03T11:00:00.000Z" }] });
    expect(source).toEqual([{ source: "referral", createdLeads: 2, qualifiedSnapshot: 1, convertedCohort: 1, conversionRate: 0.5 }]);
  });

  it("does not double-count a payment allocated to multiple invoices", () => {
    const result = calculateReceivables({ asOfDate: "2026-10-21", invoices: [{ id: "invoice-1", currency: "INR", totalMinor: "1000", dueDate: "2026-10-20", issued: true, voided: false }, { id: "invoice-2", currency: "INR", totalMinor: "2000", dueDate: "2026-10-21", issued: true, voided: false }], payments: [{ id: "payment-1", status: "posted" }], allocations: [{ paymentId: "payment-1", invoiceId: "invoice-1", amountMinor: "500" }, { paymentId: "payment-1", invoiceId: "invoice-2", amountMinor: "500" }] });
    expect(result.receivables).toEqual({ INR: "2000" });
    expect(result.overdue).toEqual({ INR: "500" });
  });

  it("normalizes inclusive UTC report filters", () => {
    expect(normalizeReportFilters({}, new Date("2026-10-21T12:00:00.000Z"))).toEqual({ periodFrom: "2026-10-01", periodTo: "2026-10-21", asOfDate: "2026-10-21", departmentIds: [], currencyCodes: [] });
    expect(() => normalizeReportFilters({ periodFrom: "2026-10-22", periodTo: "2026-10-21" })).toThrow();
  });
});

describe("financial integrity", () => {
  it("handles partial payments and ignores reversed or refunded payment allocations", () => {
    const result = calculateReceivables({
      asOfDate: "2026-11-19",
      invoices: [
        { id: "inv-1", currency: "INR", totalMinor: "1000000", dueDate: "2026-11-01", issued: true, voided: false },
        { id: "inv-2", currency: "INR", totalMinor: "500000", dueDate: "2026-12-01", issued: true, voided: false },
        { id: "inv-3", currency: "USD", totalMinor: "20000", dueDate: "2026-11-10", issued: true, voided: false },
        { id: "draft", currency: "INR", totalMinor: "999999", dueDate: null, issued: false, voided: false },
        { id: "void", currency: "INR", totalMinor: "999999", dueDate: "2026-01-01", issued: true, voided: true },
      ],
      payments: [{ id: "p-posted", status: "posted" }, { id: "p-refunded", status: "refunded" }, { id: "p-reversed", status: "reversed" }],
      allocations: [
        { paymentId: "p-posted", invoiceId: "inv-1", amountMinor: "400000" },
        { paymentId: "p-refunded", invoiceId: "inv-1", amountMinor: "600000" },
        { paymentId: "p-reversed", invoiceId: "inv-2", amountMinor: "500000" },
      ],
    });
    // inv-1: 10,000 − 4,000 posted = 6,000 (the refunded 6,000 does not settle it); inv-2 fully open; USD kept separate.
    expect(result.receivables).toEqual({ INR: "1100000", USD: "20000" });
    expect(result.overdue).toEqual({ INR: "600000", USD: "20000" });
  });
});
