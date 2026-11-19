import { describe, expect, it } from "vitest";

import { compactMinor, formatCurrencies, formatMajor, formatMinor, majorToMinorString, sumByCurrency } from "@/lib/format";

describe("money formatting", () => {
  it("formats deal values as MAJOR units (regression: ₹2,50,000 pipeline was shown as ₹2,500)", () => {
    // Deals store expected_value as numeric major units; the three live open deals sum to 250000.00.
    const pipelineMinor = sumByCurrency(["85000.00", "80000.00", "85000.00"].map((v) => ({ currency: "INR", minor: majorToMinorString(v) })));
    expect(pipelineMinor).toEqual([{ currency: "INR", minor: "25000000" }]);
    expect(formatMinor(pipelineMinor[0].minor, "INR")).toBe("₹2,50,000");
    expect(formatMajor("250000.00", "INR")).toBe("₹2,50,000");
    expect(formatMajor("85000.5", "INR")).toBe("₹85,000.50");
  });

  it("formats finance amounts as MINOR units without float rounding", () => {
    expect(formatMinor("3150000", "INR")).toBe("₹31,500");
    expect(formatMinor("123456789", "INR")).toBe("₹12,34,567.89");
    expect(formatMinor("-23600", "INR")).toBe("−₹236");
    expect(formatMinor("199", "USD")).toBe("$1.99");
  });

  it("never combines different currencies", () => {
    const rows = [{ currency: "INR", minor: "100" }, { currency: "USD", minor: "250" }, { currency: "INR", minor: "50" }];
    expect(sumByCurrency(rows)).toEqual([{ currency: "INR", minor: "150" }, { currency: "USD", minor: "250" }]);
    expect(formatCurrencies(rows)).toBe("₹1.50 · $2.50");
    expect(formatCurrencies([], "INR")).toBe("₹0");
  });

  it("compacts chart axis values with Indian units", () => {
    expect(compactMinor(25_000_000, "INR")).toBe("₹2.5L");
    expect(compactMinor(1_500_000_000, "INR")).toBe("₹1.5Cr");
  });
});
