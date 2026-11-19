import { describe, expect, it } from "vitest";

import { clientCreateSchema } from "@/features/crm/clients/schemas";
import { dealCreateSchema } from "@/features/crm/deals/schemas";
import { leadConversionSchema, leadCreateSchema, leadUpdateSchema } from "@/features/crm/leads/schemas";

describe("CRM schemas", () => {
  it("accepts a valid lead and applies defaults", () => {
    const lead = leadCreateSchema.parse({ contactName: "Ada Lovelace", source: "referral" });
    expect(lead.status).toBe("new");
    expect(lead.contactName).toBe("Ada Lovelace");
  });

  it("rejects invalid lead contact data", () => {
    expect(() => leadCreateSchema.parse({ contactName: "", email: "not-an-email", source: "" })).toThrow();
  });

  it("accepts partial lead edits but rejects an empty edit at the service boundary", () => {
    expect(leadUpdateSchema.parse({ status: "qualified" }).status).toBe("qualified");
    expect(leadUpdateSchema.parse({})).toEqual({});
  });

  it("validates client contacts and deal values", () => {
    expect(clientCreateSchema.parse({ name: "Acme", contacts: [{ name: "Primary", isPrimary: true }] }).contacts).toHaveLength(1);
    expect(dealCreateSchema.parse({ title: "Implementation", expectedValue: "1200", currency: "usd" }).currency).toBe("USD");
    expect(() => dealCreateSchema.parse({ title: "Bad", expectedValue: -1, currency: "USD" })).toThrow();
  });

  it("requires complete lead conversion input", () => {
    expect(() => leadConversionSchema.parse({ client: { name: "Acme" } })).toThrow();
    expect(leadConversionSchema.parse({ client: { name: "Acme", companyName: "Acme Inc", phone: "+1 555 0100" }, deal: { title: "Deal", expectedValue: 10, currency: "USD" } }).deal.title).toBe("Deal");
  });
});
