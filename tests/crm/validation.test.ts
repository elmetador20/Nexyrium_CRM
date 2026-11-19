import { describe, expect, it } from "vitest";

import { expenseCreateSchema } from "@/features/accounting/schemas";
import { clientCreateSchema } from "@/features/crm/clients/schemas";
import { dealCreateSchema } from "@/features/crm/deals/schemas";
import { leadConversionSchema, leadManualCreateSchema } from "@/features/crm/leads/schemas";
import { manualCrmLeadSchema } from "@/features/lead-intake/schemas";
import { paymentCreateSchema } from "@/features/payments/schemas";
import { taskCreateSchema } from "@/features/tasks/schemas";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("mandatory fields", () => {
  it("lead: name, company and phone are required; everything else is optional", () => {
    const minimal = { contactName: "Asha", companyName: "Studio A", phone: "+91 98765 43210", source: "manual" };
    expect(ok(leadManualCreateSchema, minimal)).toBe(true);
    expect(ok(leadManualCreateSchema, { ...minimal, companyName: "" })).toBe(false);
    expect(ok(leadManualCreateSchema, { ...minimal, phone: " " })).toBe(false);
    expect(ok(leadManualCreateSchema, { ...minimal, contactName: "" })).toBe(false);
    // The CRM form posts through lead intake; both paths must agree.
    expect(ok(manualCrmLeadSchema, { ...minimal, eventId: "evt-1" })).toBe(true);
    expect(ok(manualCrmLeadSchema, { ...minimal, eventId: "evt-1", phone: "" })).toBe(false);
  });

  it("client conversion follows client rules (name, company, phone)", () => {
    const deal = { title: "Website", expectedValue: 1000, currency: "inr" };
    expect(ok(leadConversionSchema, { client: { name: "Asha", companyName: "Studio A", phone: "9876543210" }, deal })).toBe(true);
    expect(ok(leadConversionSchema, { client: { name: "Asha" }, deal })).toBe(false);
  });

  it("client: base schema keeps optional fields optional (create adds company + phone in the service)", () => {
    expect(ok(clientCreateSchema, { name: "Asha" })).toBe(true);
    expect(ok(clientCreateSchema, { name: "" })).toBe(false);
  });

  it("deal: name and value are required; department, client and dates are optional", () => {
    expect(ok(dealCreateSchema, { title: "Brand refresh", expectedValue: "85000", currency: "INR" })).toBe(true);
    expect(ok(dealCreateSchema, { title: "", expectedValue: "85000", currency: "INR" })).toBe(false);
    expect(ok(dealCreateSchema, { title: "Brand refresh", expectedValue: -1, currency: "INR" })).toBe(false);
  });

  it("expense: title, amount and date are required; category and department are optional", () => {
    const expense = { description: "Hosting", amountMinor: "23600", currencyCode: "INR", incurredOn: "2026-11-01" };
    expect(ok(expenseCreateSchema, expense)).toBe(true);
    expect(expenseCreateSchema.parse(expense).category).toBe("Other");
    expect(ok(expenseCreateSchema, { ...expense, description: "" })).toBe(false);
    expect(ok(expenseCreateSchema, { ...expense, amountMinor: "0" })).toBe(false);
    expect(ok(expenseCreateSchema, { ...expense, incurredOn: "" })).toBe(false);
  });

  it("task: only the title is required", () => {
    expect(ok(taskCreateSchema, { title: "Send proposal" })).toBe(true);
    expect(ok(taskCreateSchema, { title: "" })).toBe(false);
  });

  it("payment: amount, date and status are required and only 'posted' can be recorded", () => {
    const payment = { clientId: "11111111-1111-4111-8111-111111111111", amountMinor: "3150000", currencyCode: "INR", receivedAt: "2026-11-02", paymentMethod: "upi", idempotencyKey: "k-1" };
    expect(paymentCreateSchema.parse(payment).status).toBe("posted");
    expect(ok(paymentCreateSchema, { ...payment, amountMinor: "0" })).toBe(false);
    expect(ok(paymentCreateSchema, { ...payment, receivedAt: "not a date" })).toBe(false);
    expect(ok(paymentCreateSchema, { ...payment, status: "refunded" })).toBe(false);
  });
});
