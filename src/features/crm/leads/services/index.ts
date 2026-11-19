import { PERMISSIONS } from "@/lib/authorization/permissions";
import type { AuthorizationActor } from "@/lib/authorization/policy";

import { CrmError } from "@/features/crm/shared/errors";
import { getCrmScope } from "@/features/crm/shared/types";
import { requireCrmPermission, requireNonEmptyPatch, resolveCrmAssignment } from "@/features/crm/shared/service";
import { normalizeLeadContact } from "@/features/lead-intake/normalization";
import {
  leadActivitySchema,
  leadManualCreateSchema,
  leadListSchema,
  leadUpdateSchema,
  type LeadActivityInput,
  type LeadCreateInput,
  type LeadListInput,
  type LeadUpdateInput,
} from "@/features/crm/leads/schemas";
import { formatSourceDetails, getAcquisitionSource, splitSourceDetails } from "../acquisition-source";
import type { Lead } from "@/db/schema";

import type { LeadMutation, LeadRepository } from "../queries";

type LeadServiceDependencies = {
  repository: LeadRepository;
  audit: import("@/features/crm/shared/types").CrmAuditWriter;
};

function normalizeLeadInput(input: LeadCreateInput | LeadUpdateInput, current?: Lead): Partial<LeadMutation> {
  const { acquisitionSource, sourceDetails, ...fields } = input;
  const normalized: Partial<LeadMutation> = fields;
  for (const field of ["email", "phone", "companyName", "notes", "nextAction"] as const) {
    if (field in fields) normalized[field] = fields[field] || null;
  }
  if (sourceDetails !== undefined || acquisitionSource !== undefined) {
    const previous = splitSourceDetails(current?.sourceDetails);
    normalized.sourceDetails = formatSourceDetails(
      sourceDetails === undefined ? previous.details : sourceDetails,
      acquisitionSource ?? previous.acquisitionSource,
    );
  }
  if ("email" in input || "phone" in input) {
    const contact = normalizeLeadContact({
      email: input.email === undefined ? current?.email : input.email,
      phone: input.phone === undefined ? current?.phone : input.phone,
    });
    if (current && (input.phone === undefined || normalized.phone === current.phone)) {
      contact.normalizedPhone = current.normalizedPhone;
    }
    Object.assign(normalized, contact);
  }
  return normalized;
}

function getLeadOrThrow(lead: Lead | null): Lead {
  if (!lead) throw new CrmError("NOT_FOUND", "Lead not found.");
  return lead;
}

export function createLeadService({ repository, audit }: LeadServiceDependencies) {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_READ);
      const input = leadListSchema.parse(rawInput) satisfies LeadListInput;
      const result = await repository.list(input, getCrmScope(actor));
      return {
        ...result,
        items: result.items.map((lead) => ({
          ...lead,
          acquisitionSource: getAcquisitionSource(lead.source, lead.sourceDetails) ?? null,
        })),
      };
    },

    async get(actor: AuthorizationActor, leadId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_READ);
      const lead = getLeadOrThrow(await repository.findById(leadId, getCrmScope(actor)));
      const [activities, sourceHistory] = await Promise.all([
        repository.listActivities(lead.id),
        repository.listSourceHistory(lead.id),
      ]);
      return { lead, activities, sourceHistory };
    },

    async create(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_CREATE);
      const input = leadManualCreateSchema.parse(rawInput);
      const assignment = resolveCrmAssignment(actor, input.ownerId, input.departmentId);
      const lead = await repository.create({
        ...normalizeLeadInput(input),
        source: input.source,
        status: input.status,
        ownerId: assignment.ownerId,
        departmentId: assignment.departmentId,
      } as LeadMutation);

      await repository.addSourceHistory({
        leadId: lead.id,
        source: lead.source,
        details: lead.sourceDetails,
        recordedByUserId: actor.userId,
      });
      await audit({
        actorUserId: actor.userId,
        action: "crm.lead.create",
        resourceType: "lead",
        resourceId: lead.id,
        outcome: "success",
        metadata: { source: lead.source, status: lead.status },
      });
      return lead;
    },

    async update(actor: AuthorizationActor, leadId: string, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_UPDATE);
      const input = leadUpdateSchema.parse(rawInput);
      requireNonEmptyPatch(input);
      const scope = getCrmScope(actor);
      const current = getLeadOrThrow(await repository.findById(leadId, scope));
      const assignment = resolveCrmAssignment(actor, input.ownerId ?? current.ownerId, input.departmentId ?? current.departmentId);
      const updated = getLeadOrThrow(
        await repository.update(leadId, {
          ...normalizeLeadInput(input, current),
          ownerId: assignment.ownerId,
          departmentId: assignment.departmentId,
        }, scope),
      );

      if (updated.source !== current.source || updated.sourceDetails !== current.sourceDetails) {
        await repository.addSourceHistory({
          leadId: updated.id,
          source: updated.source,
          details: updated.sourceDetails,
          recordedByUserId: actor.userId,
        });
      }
      await audit({
        actorUserId: actor.userId,
        action: "crm.lead.update",
        resourceType: "lead",
        resourceId: updated.id,
        outcome: "success",
        metadata: { changedFields: Object.keys(input) },
      });
      return updated;
    },

    async archive(actor: AuthorizationActor, leadId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_DELETE);
      const lead = getLeadOrThrow(await repository.archive(leadId, getCrmScope(actor)));
      await audit({
        actorUserId: actor.userId,
        action: "crm.lead.archive",
        resourceType: "lead",
        resourceId: lead.id,
        outcome: "success",
      });
      return lead;
    },

    async addActivity(actor: AuthorizationActor, leadId: string, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_UPDATE);
      const input = leadActivitySchema.parse(rawInput) satisfies LeadActivityInput;
      const lead = getLeadOrThrow(await repository.findById(leadId, getCrmScope(actor)));
      const activity = await repository.addActivity({
        leadId: lead.id,
        actorUserId: actor.userId,
        type: input.type,
        content: input.content,
        occurredAt: input.occurredAt,
      });
      await audit({
        actorUserId: actor.userId,
        action: "crm.lead.activity.create",
        resourceType: "lead",
        resourceId: lead.id,
        outcome: "success",
        metadata: { activityType: input.type },
      });
      return activity;
    },
  };
}
