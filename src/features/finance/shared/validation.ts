import { createHash } from "node:crypto";

import type { AuthorizationActor } from "@/lib/authorization/policy";
import { financeScope } from "./scope";
import { FinanceError } from "./errors";
import { findClient, findDeal, findProject, findQuotation } from "./repository";

export async function validateFinanceLinks(actor: AuthorizationActor, input: { clientId: string; dealId?: string | null; projectId?: string | null; quotationId?: string | null }) {
  const scope = financeScope(actor);
  const client = await findClient(input.clientId, scope);
  if (!client) throw new FinanceError("NOT_FOUND", "Client not found.");
  const deal = input.dealId ? await findDeal(input.dealId, scope) : null;
  if (input.dealId && !deal) throw new FinanceError("NOT_FOUND", "Deal not found.");
  const project = input.projectId ? await findProject(input.projectId, scope) : null;
  if (input.projectId && !project) throw new FinanceError("NOT_FOUND", "Project not found.");
  const quotation = input.quotationId ? await findQuotation(input.quotationId, scope) : null;
  if (input.quotationId && !quotation) throw new FinanceError("NOT_FOUND", "Quotation not found.");
  if (deal?.clientId && deal.clientId !== client.id) throw new FinanceError("CONFLICT", "The selected deal belongs to another client.");
  if (project && project.clientId && project.clientId !== client.id) throw new FinanceError("CONFLICT", "The selected project belongs to another client.");
  if (project && input.dealId && project.dealId && project.dealId !== input.dealId) throw new FinanceError("CONFLICT", "The selected project belongs to another deal.");
  if (quotation && quotation.clientId !== client.id) throw new FinanceError("CONFLICT", "The selected quotation belongs to another client.");
  if (quotation?.status === "canceled") throw new FinanceError("CONFLICT", "A canceled quotation cannot be linked to an invoice.");
  return { client, deal, project, quotation };
}

export function snapshotHash(snapshot: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(snapshot, Object.keys(snapshot).sort())).digest("hex");
}
