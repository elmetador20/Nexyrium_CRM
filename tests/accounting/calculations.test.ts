import { describe, expect, it } from "vitest";

import { calculateJournalTotals, isBalancedJournal, parseSignedMinor } from "@/features/accounting/shared/balance";
import { hashAccountingPayload } from "@/features/accounting/shared/idempotency";
import { expenseCreateSchema, journalEntryCreateSchema, reconciliationItemSchema } from "@/features/accounting/schemas";

describe("accounting calculations and validation", () => {
  it("calculates journal totals with integer minor units", () => {
    const lines = [{ debitMinor: "12500", creditMinor: "0" }, { debitMinor: "0", creditMinor: "12500" }];
    expect(calculateJournalTotals(lines)).toEqual({ debit: BigInt(12500), credit: BigInt(12500) });
    expect(isBalancedJournal(lines)).toBe(true);
    expect(isBalancedJournal([{ debitMinor: "100", creditMinor: "0" }, { debitMinor: "0", creditMinor: "99" }])).toBe(false);
  });

  it("rejects lines with both sides or no side", () => {
    const base = { entryDate: "2026-10-21", periodId: "11111111-1111-4111-8111-111111111111", currencyCode: "INR", memo: "Manual entry" };
    expect(() => journalEntryCreateSchema.parse({ ...base, lines: [{ accountId: "11111111-1111-4111-8111-111111111111", description: "bad", debitMinor: "1", creditMinor: "1" }] })).toThrow();
    expect(() => journalEntryCreateSchema.parse({ ...base, lines: [{ accountId: "11111111-1111-4111-8111-111111111111", description: "bad", debitMinor: "0", creditMinor: "0" }] })).toThrow();
  });

  it("validates expense amounts and reconciliation items", () => {
    expect(expenseCreateSchema.parse({ category: "Travel", description: "Taxi", amountMinor: "2500", currencyCode: "inr", incurredOn: "2026-10-21" }).currencyCode).toBe("INR");
    expect(() => expenseCreateSchema.parse({ category: "Travel", description: "Taxi", amountMinor: "0", currencyCode: "INR", incurredOn: "2026-10-21" })).toThrow();
    expect(reconciliationItemSchema.parse({ externalTransactionId: "bank-1", transactionOn: "2026-10-21", description: "Deposit", amountMinor: "100", direction: "credit" }).direction).toBe("credit");
  });

  it("hashes idempotency payloads canonically", () => {
    expect(hashAccountingPayload({ b: 2, a: { d: 4, c: 3 } })).toBe(hashAccountingPayload({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("supports signed reconciliation balances", () => {
    expect(parseSignedMinor("-125")).toBe(BigInt(-125));
  });
});
