import { PERMISSIONS } from "@/lib/authorization/permissions";
import type { AuthorizationActor } from "@/lib/authorization/policy";

import { CrmError } from "@/features/crm/shared/errors";
import { requireCrmPermission, requireNonEmptyPatch, resolveCrmAssignment } from "@/features/crm/shared/service";
import { getCrmScope } from "@/features/crm/shared/types";
import {
  dealCreateSchema,
  dealListSchema,
  dealUpdateSchema,
  type DealCreateInput,
  type DealListInput,
  type DealUpdateInput,
} from "@/features/crm/deals/schemas";
import type { Deal } from "@/db/schema";

import type { DealMutation, DealRepository } from "../queries";

type DealServiceDependencies = {
  repository: DealRepository;
  audit: import("@/features/crm/shared/types").CrmAuditWriter;
};

function normalizeDealInput(input: DealCreateInput | DealUpdateInput): Partial<DealMutation> {
  return {
    ...input,
    expectedValue: input.expectedValue === undefined ? undefined : input.expectedValue.toFixed(2),
    currency: input.currency?.toUpperCase(),
    expectedCloseDate: input.expectedCloseDate ? input.expectedCloseDate.toISOString().slice(0, 10) : input.expectedCloseDate,
    notes: input.notes || null,
  };
}

function getDealOrThrow(deal: Deal | null): Deal {
  if (!deal) throw new CrmError("NOT_FOUND", "Deal not found.");
  return deal;
}

export function createDealService({ repository, audit }: DealServiceDependencies) {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_DEALS_READ);
      const input = dealListSchema.parse(rawInput) satisfies DealListInput;
      return repository.list(input, getCrmScope(actor));
    },

    async get(actor: AuthorizationActor, dealId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_DEALS_READ);
      return getDealOrThrow(await repository.findById(dealId, getCrmScope(actor)));
    },

    async create(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_DEALS_CREATE);
      const input = dealCreateSchema.parse(rawInput);
      const assignment = resolveCrmAssignment(actor, input.ownerId, input.departmentId);
      const deal = await repository.create({
        ...normalizeDealInput(input),
        stage: input.stage,
        expectedValue: input.expectedValue.toFixed(2),
        currency: input.currency.toUpperCase(),
        ownerId: assignment.ownerId,
        departmentId: assignment.departmentId,
      } as DealMutation);
      await audit({
        actorUserId: actor.userId,
        action: "crm.deal.create",
        resourceType: "deal",
        resourceId: deal.id,
        outcome: "success",
        metadata: { stage: deal.stage },
      });
      return deal;
    },

    async update(actor: AuthorizationActor, dealId: string, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_DEALS_UPDATE);
      const input = dealUpdateSchema.parse(rawInput);
      requireNonEmptyPatch(input);
      const scope = getCrmScope(actor);
      const current = getDealOrThrow(await repository.findById(dealId, scope));
      const assignment = resolveCrmAssignment(actor, input.ownerId ?? current.ownerId, input.departmentId ?? current.departmentId);
      const updated = getDealOrThrow(
        await repository.update(dealId, {
          ...normalizeDealInput(input),
          ownerId: assignment.ownerId,
          departmentId: assignment.departmentId,
        }, scope),
      );
      await audit({
        actorUserId: actor.userId,
        action: "crm.deal.update",
        resourceType: "deal",
        resourceId: updated.id,
        outcome: "success",
        metadata: { changedFields: Object.keys(input) },
      });
      return updated;
    },

    async archive(actor: AuthorizationActor, dealId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_DEALS_DELETE);
      const deal = getDealOrThrow(await repository.archive(dealId, getCrmScope(actor)));
      await audit({
        actorUserId: actor.userId,
        action: "crm.deal.archive",
        resourceType: "deal",
        resourceId: deal.id,
        outcome: "success",
      });
      return deal;
    },
  };
}
