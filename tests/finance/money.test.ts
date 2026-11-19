import { describe, expect, it } from "vitest";

import { addMinor, calculateLine, calculateTotals, formatMoney, majorToMinor, multiplyQuantityMinor, percentageMinor, percentToBasisPoints, subtractMinor } from "@/features/finance/shared/money";
import { formatFinancialNumber } from "@/features/finance/shared/numbering";

describe("finance money utilities", () => {
  it("keeps arithmetic in integer minor units", () => {
    expect(addMinor("100", "25", BigInt(75))).toBe("200");
    expect(subtractMinor("200", "75")).toBe("125");
    expect(multiplyQuantityMinor("1.250000", "800")).toBe("1000");
    expect(percentageMinor("10000", 1250)).toBe("1250");
  });

  it("rounds quantity and percentage results deterministically", () => {
    expect(multiplyQuantityMinor("0.333333", "100")).toBe("33");
    expect(percentageMinor("1", 5000)).toBe("1");
    expect(() => subtractMinor("10", "11")).toThrow();
    expect(() => multiplyQuantityMinor("1.1234567", "10")).toThrow();
  });

  it("calculates line and document totals without floating point values", () => {
    expect(calculateLine({ quantity: "2", unitPriceMinor: "1000", discountBps: 1000, taxBps: 1800 })).toEqual({
      grossMinor: "2000",
      discountMinor: "200",
      taxableMinor: "1800",
      taxMinor: "324",
      totalMinor: "2124",
    });
    expect(calculateTotals([
      { quantity: "1", unitPriceMinor: "1000" },
      { quantity: "2", unitPriceMinor: "500", taxBps: 1000 },
    ])).toEqual({ subtotalMinor: "2000", discountMinor: "0", taxMinor: "100", totalMinor: "2100" });
  });

  it("formats safe yearly document numbers", () => {
    expect(formatFinancialNumber("INV", 2026, 42)).toBe("INV-2026-000042");
  });

  it("converts user-facing decimal amounts without floating point arithmetic", () => {
    expect(majorToMinor("1250.50", "INR")).toBe("125050");
    expect(majorToMinor("12.5", "USD")).toBe("1250");
    expect(majorToMinor("12.345", "KWD")).toBe("12345");
    expect(majorToMinor("1200", "JPY")).toBe("1200");
    expect(percentToBasisPoints("5.5")).toBe(550);
    expect(() => majorToMinor("1200.5", "JPY")).toThrow();
    expect(() => percentToBasisPoints("5.555")).toThrow();
    expect(formatMoney("1500000", "INR")).toBe("INR 15,000.00");
  });
});
