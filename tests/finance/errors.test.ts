import { describe, expect, it } from "vitest";

import { FinanceError, financeErrorResponse } from "@/features/finance/shared/errors";

describe("finance error contracts", () => {
  it("returns stable status, error, and code fields", async () => {
    const response = financeErrorResponse(new FinanceError("NOT_FOUND", "Invoice not found."));
    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toEqual({ error: "Invoice not found.", code: "NOT_FOUND" });
  });
});
