import { describe, expect, it } from "vitest";

import { normalizeEmail, normalizePhone } from "@/features/lead-intake/normalization";

describe("lead intake normalization", () => {
  it("normalizes email without changing the submitted value", () => {
    expect(normalizeEmail("  ADA@Example.COM ")).toBe("ada@example.com");
  });

  it("only normalizes a local phone number when country context is provided", () => {
    expect(normalizePhone("(555) 010-1234")).toBeNull();
    expect(normalizePhone("(555) 010-1234", "+1")).toBe("+15550101234");
  });

  it("accepts an already-qualified international number without guessing", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
});
