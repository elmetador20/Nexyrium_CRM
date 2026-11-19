import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";

import { leadConversionSchema } from "@/features/crm/leads/schemas";
import { CrmError } from "@/features/crm/shared/errors";
import { getCrmScope } from "@/features/crm/shared/types";

import type { ConversionTransaction } from "./conversion";

export function createLeadConversionService(transaction: ConversionTransaction) {
  return async function convert(actor: AuthorizationActor, leadId: string, rawInput: unknown) {
    if (!can(actor, PERMISSIONS.CRM_LEADS_CONVERT)) {
      throw new CrmError("FORBIDDEN", "You do not have permission to convert leads.");
    }

    const input = leadConversionSchema.parse(rawInput);
    const scope = getCrmScope(actor);

    return transaction(async (uow) => {
      const lead = await uow.leads.findById(leadId, scope);
      if (!lead) throw new CrmError("NOT_FOUND", "Lead not found.");
      if (lead.convertedAt) throw new CrmError("CONFLICT", "This lead has already been converted.");

      const client = await uow.clients.create({
        name: input.client.name,
        companyName: input.client.companyName || lead.companyName,
        email: input.client.email || lead.email,
        phone: input.client.phone || lead.phone,
        website: input.client.website || null,
        notes: input.client.notes || lead.notes,
        ownerId: lead.ownerId ?? actor.userId,
        departmentId: lead.departmentId ?? actor.departmentIds[0] ?? null,
      });
      await uow.clients.linkLead(client.id, lead.id);

      const deal = await uow.deals.create({
        title: input.deal.title,
        stage: "qualified",
        expectedValue: input.deal.expectedValue.toFixed(2),
        currency: input.deal.currency,
        expectedCloseDate: input.deal.expectedCloseDate?.toISOString().slice(0, 10),
        ownerId: lead.ownerId ?? actor.userId,
        departmentId: lead.departmentId ?? actor.departmentIds[0] ?? null,
        clientId: client.id,
        leadId: lead.id,
        notes: input.deal.notes || null,
      });
      const convertedLead = await uow.leads.markConverted(lead.id);
      await uow.audit({
        actorUserId: actor.userId,
        action: "crm.lead.convert",
        resourceType: "lead",
        resourceId: lead.id,
        outcome: "success",
        metadata: { clientId: client.id, dealId: deal.id },
      });

      return { lead: convertedLead, client, deal };
    });
  };
}
