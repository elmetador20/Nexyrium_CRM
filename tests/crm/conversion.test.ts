import { describe, expect, it } from "vitest";

import { createLeadConversionService } from "@/features/crm/leads/services/conversion-service";
import type { ConversionTransaction, ConversionUnitOfWork } from "@/features/crm/leads/services/conversion";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const actor: AuthorizationActor = {
  userId: "sales-user",
  email: "sales@example.com",
  name: "Sales",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [PERMISSIONS.CRM_LEADS_CONVERT],
  departmentIds: ["sales-department"],
};

const lead = {
  id: "lead-1",
  contactName: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  companyName: "Analytical Engines",
  source: "referral",
  sourceDetails: null,
  status: "qualified" as const,
  ownerId: actor.userId,
  departmentId: "sales-department",
  notes: null,
  nextAction: null,
  nextActionAt: null,
  convertedAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function transactionFixture(failAt?: "client" | "deal"): { transaction: ConversionTransaction; state: { client: boolean; deal: boolean; converted: boolean; audited: boolean } } {
  const state = { client: false, deal: false, converted: false, audited: false };
  const transaction: ConversionTransaction = async (work) => {
    const snapshot = { ...state };
    try {
      const uow: ConversionUnitOfWork = {
        leads: {
          findById: async () => lead,
          markConverted: async () => { state.converted = true; return { ...lead, convertedAt: new Date(), status: "won" }; },
        },
        clients: {
          create: async () => { if (failAt === "client") throw new Error("client failed"); state.client = true; return { id: "client-1" }; },
          linkLead: async () => undefined,
        },
        deals: {
          create: async () => { if (failAt === "deal") throw new Error("deal failed"); state.deal = true; return { id: "deal-1" }; },
        },
        audit: async () => { state.audited = true; },
      } as unknown as ConversionUnitOfWork;
      return await work(uow);
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  };
  return { transaction, state };
}

describe("lead conversion", () => {
  it("atomically creates the client and deal and marks the lead converted", async () => {
    const { transaction, state } = transactionFixture();
    const convert = createLeadConversionService(transaction);
    const result = await convert(actor, lead.id, { client: { name: "Acme", companyName: "Acme Inc", phone: "+91 90000 00000" }, deal: { title: "Rollout", expectedValue: 1000, currency: "USD" } });
    expect(result.client.id).toBe("client-1");
    expect(result.deal.id).toBe("deal-1");
    expect(state).toEqual({ client: true, deal: true, converted: true, audited: true });
  });

  it("rolls back every side effect if deal creation fails", async () => {
    const { transaction, state } = transactionFixture("deal");
    const convert = createLeadConversionService(transaction);
    await expect(convert(actor, lead.id, { client: { name: "Acme", companyName: "Acme Inc", phone: "+91 90000 00000" }, deal: { title: "Rollout", expectedValue: 1000, currency: "USD" } })).rejects.toThrow("deal failed");
    expect(state).toEqual({ client: false, deal: false, converted: false, audited: false });
  });

  it("rejects conversion without permission before starting a transaction", async () => {
    let started = false;
    const transaction: ConversionTransaction = async () => { started = true; throw new Error("should not run"); };
    const convert = createLeadConversionService(transaction);
    await expect(convert({ ...actor, permissions: [] }, lead.id, { client: { name: "Acme", companyName: "Acme Inc", phone: "+91 90000 00000" }, deal: { title: "Rollout", expectedValue: 1000, currency: "USD" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(started).toBe(false);
  });
});
