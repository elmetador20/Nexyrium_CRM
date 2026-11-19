import { describe, expect, it } from "vitest";

import type { Client, Deal, Lead } from "@/db/schema";
import { clientCreateSchema } from "@/features/crm/clients/schemas";
import { createClientService } from "@/features/crm/clients/services";
import type { ClientRepository } from "@/features/crm/clients/queries";
import { createDealService } from "@/features/crm/deals/services";
import type { DealRepository } from "@/features/crm/deals/queries";
import { createLeadService } from "@/features/crm/leads/services";
import type { LeadRepository } from "@/features/crm/leads/queries";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const actor: AuthorizationActor = {
  userId: "sales-user",
  email: "sales@example.com",
  name: "Sales",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [
    PERMISSIONS.CRM_LEADS_READ,
    PERMISSIONS.CRM_LEADS_CREATE,
    PERMISSIONS.CRM_LEADS_UPDATE,
    PERMISSIONS.CRM_CLIENTS_READ,
    PERMISSIONS.CRM_CLIENTS_CREATE,
    PERMISSIONS.CRM_CLIENTS_UPDATE,
    PERMISSIONS.CRM_DEALS_READ,
    PERMISSIONS.CRM_DEALS_CREATE,
    PERMISSIONS.CRM_DEALS_UPDATE,
  ],
  departmentIds: ["sales-department"],
};

function leadFixture(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    contactName: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
    normalizedEmail: "ada@example.com",
    normalizedPhone: null,
    normalizationVersion: "v1",
    companyName: "Analytical Engines",
    source: "referral",
    sourceDetails: null,
    status: "new",
    ownerId: "sales-user",
    departmentId: "sales-department",
    notes: null,
    nextAction: null,
    nextActionAt: null,
    convertedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function clientFixture(): Client {
  return { id: "client-1", name: "Acme", companyName: "Acme Inc", email: null, phone: null, website: null, notes: null, ownerId: "sales-user", departmentId: "sales-department", archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
}

function dealFixture(): Deal {
  return { id: "deal-1", title: "Acme rollout", stage: "prospecting", expectedValue: "1000.00", currency: "USD", expectedCloseDate: null, ownerId: "sales-user", departmentId: "sales-department", clientId: null, leadId: null, notes: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date() };
}

describe("CRM CRUD services", () => {
  it("creates, lists, and updates a lead while auditing changes", async () => {
    let lead = leadFixture();
    let createCalls = 0;
    const audits: string[] = [];
    const repository = {
      list: async () => ({ items: [lead], total: 1 }),
      findById: async () => lead,
      create: async (input: object) => { createCalls += 1; lead = { ...lead, ...input } as Lead; return lead; },
      update: async (_id: string, input: object) => { lead = { ...lead, ...input, updatedAt: new Date() } as Lead; return lead; },
      archive: async () => lead,
      addActivity: async () => ({ id: "activity-1" }),
      listActivities: async () => [],
      addSourceHistory: async () => ({ id: "source-1" }),
      listSourceHistory: async () => [],
    } as unknown as LeadRepository;
    const service = createLeadService({ repository, audit: async (event) => { audits.push(event.action); } });

    const created = await service.create(actor, { contactName: "Ada", companyName: "Analytical Engines", phone: "+91 98765 43210", source: "referral" });
    expect(created.ownerId).toBe(actor.userId);
    expect(createCalls).toBe(1);
    expect((await service.list(actor, { page: 1, pageSize: 20 })).total).toBe(1);
    const updated = await service.update(actor, lead.id, { status: "qualified", nextAction: "Call" });
    expect(updated.status).toBe("qualified");
    expect(audits).toEqual(["crm.lead.create", "crm.lead.update"]);
  });

  it("rejects invalid lead input and does not mutate", async () => {
    let createCalls = 0;
    const repository = { create: async () => { createCalls += 1; return leadFixture(); } } as unknown as LeadRepository;
    const service = createLeadService({ repository, audit: async () => undefined });
    await expect(service.create(actor, { contactName: "", source: "" })).rejects.toThrow();
    expect(createCalls).toBe(0);
  });

  it("rejects a role without the required client permission", async () => {
    const repository = {} as unknown as ClientRepository;
    const service = createClientService({ repository, audit: async () => undefined });
    await expect(service.create({ ...actor, permissions: [] }, { name: "Acme" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates client and deal records through their feature services", async () => {
    const client = clientFixture();
    const clientRepository = {
      create: async () => client,
      replaceContacts: async () => [],
    } as unknown as ClientRepository;
    const deal = dealFixture();
    const dealRepository = { create: async () => deal } as unknown as DealRepository;
    const clientService = createClientService({ repository: clientRepository, audit: async () => undefined });
    const dealService = createDealService({ repository: dealRepository, audit: async () => undefined });

    await expect(clientService.create(actor,{name:"Acme",phone:"5551234567"})).rejects.toThrow();
    await expect(clientService.create(actor,{name:"Acme",companyName:"Acme Ltd"})).rejects.toThrow();
    expect((await clientService.create(actor, clientCreateSchema.parse({ name: "Acme", companyName:"Acme Ltd", phone:"5551234567" }))).id).toBe("client-1");
    expect((await dealService.create(actor, { title: "Acme rollout", expectedValue: 1000, currency: "USD" })).id).toBe("deal-1");
  });
});
