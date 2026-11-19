import { z } from "zod";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can, type AuthorizationActor } from "@/lib/authorization/policy";

import { CrmError } from "@/features/crm/shared/errors";
import { requireCrmPermission, requireNonEmptyPatch, resolveCrmAssignment } from "@/features/crm/shared/service";
import { getCrmScope } from "@/features/crm/shared/types";
import {
  clientCreateSchema,
  clientListSchema,
  clientUpdateSchema,
  type ClientCreateInput,
  type ClientListInput,
  type ClientUpdateInput,
} from "@/features/crm/clients/schemas";
import type { Client } from "@/db/schema";

import type { ClientMutation, ClientRepository } from "../queries";

const requiredCompanyName = z.string().trim().min(1, "Enter a company name.").max(200);
const requiredPhone = z.string().trim().min(1, "Enter a phone number.").max(40);

type ClientServiceDependencies = {
  repository: ClientRepository;
  audit: import("@/features/crm/shared/types").CrmAuditWriter;
};

function normalizeClientInput(input: ClientCreateInput | ClientUpdateInput): Partial<ClientMutation> {
  const clientInput = { ...input };
  delete clientInput.contacts;
  return {
    ...clientInput,
    ...(clientInput.email !== undefined ? { email: clientInput.email || null } : {}),
    ...(clientInput.phone !== undefined ? { phone: clientInput.phone || null } : {}),
    ...(clientInput.companyName !== undefined ? { companyName: clientInput.companyName || null } : {}),
    ...(clientInput.website !== undefined ? { website: clientInput.website || null } : {}),
    ...(clientInput.notes !== undefined ? { notes: clientInput.notes || null } : {}),
  };
}

function getClientOrThrow(client: Client | null): Client {
  if (!client) throw new CrmError("NOT_FOUND", "Client not found.");
  return client;
}

function contactsFromInput(input: ClientCreateInput | ClientUpdateInput) {
  return (input.contacts ?? []).map((contact) => ({
    name: contact.name,
    email: contact.email || null,
    phone: contact.phone || null,
    jobTitle: contact.jobTitle || null,
    isPrimary: contact.isPrimary,
  }));
}

export function createClientService({ repository, audit }: ClientServiceDependencies) {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_CLIENTS_READ);
      const input = clientListSchema.parse(rawInput) satisfies ClientListInput;
      return repository.list(input, getCrmScope(actor));
    },

    async get(actor: AuthorizationActor, clientId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_CLIENTS_READ);
      const client = getClientOrThrow(await repository.findById(clientId, getCrmScope(actor)));
      const [contacts, leadLinks, deals] = await Promise.all([
        repository.listContacts(client.id),
        can(actor,PERMISSIONS.CRM_LEADS_READ) ? repository.listLeadLinks(client.id,getCrmScope(actor)) : [],
        can(actor,PERMISSIONS.CRM_DEALS_READ) ? repository.listDeals(client.id,getCrmScope(actor)) : [],
      ]);
      return { client, contacts, leadLinks, deals };
    },

    async create(actor: AuthorizationActor, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_CLIENTS_CREATE);
      const input = clientCreateSchema.extend({ companyName: requiredCompanyName, phone: requiredPhone }).parse(rawInput);
      const assignment = resolveCrmAssignment(actor, input.ownerId, input.departmentId);
      const client = await repository.create({
        ...normalizeClientInput(input),
        ownerId: assignment.ownerId,
        departmentId: assignment.departmentId,
      } as ClientMutation);
      await repository.replaceContacts(client.id, contactsFromInput(input));
      await audit({
        actorUserId: actor.userId,
        action: "crm.client.create",
        resourceType: "client",
        resourceId: client.id,
        outcome: "success",
      });
      return client;
    },

    async update(actor: AuthorizationActor, clientId: string, rawInput: unknown) {
      requireCrmPermission(actor, PERMISSIONS.CRM_CLIENTS_UPDATE);
      const input = clientUpdateSchema.parse(rawInput);
      requireNonEmptyPatch(input);
      const scope = getCrmScope(actor);
      const current = getClientOrThrow(await repository.findById(clientId, scope));
      const assignment = resolveCrmAssignment(actor, input.ownerId ?? current.ownerId, input.departmentId ?? current.departmentId);
      const updated = getClientOrThrow(
        await repository.update(clientId, {
          ...normalizeClientInput(input),
          ownerId: assignment.ownerId,
          departmentId: assignment.departmentId,
        }, scope),
      );
      if (input.contacts !== undefined) await repository.replaceContacts(updated.id, contactsFromInput(input));
      await audit({
        actorUserId: actor.userId,
        action: "crm.client.update",
        resourceType: "client",
        resourceId: updated.id,
        outcome: "success",
        metadata: { changedFields: Object.keys(input) },
      });
      return updated;
    },

    async archive(actor: AuthorizationActor, clientId: string) {
      requireCrmPermission(actor, PERMISSIONS.CRM_CLIENTS_DELETE);
      const client = getClientOrThrow(await repository.archive(clientId, getCrmScope(actor)));
      await audit({
        actorUserId: actor.userId,
        action: "crm.client.archive",
        resourceType: "client",
        resourceId: client.id,
        outcome: "success",
      });
      return client;
    },
  };
}
