import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { journalEntrySources, users, accountingAccounts, journalEntries, journalEntryLines, auditLogs, clients, expenses, deals, departmentTargets, departments, invoices, leadSourceHistory, leads, paymentAllocations, payments, projects, tasks } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { getCrmScope } from "@/features/crm/shared/types";
import { expenseScope } from "@/features/accounting/scope";
import { expenseScopeCondition } from "@/features/accounting/queries";
import { financeScope } from "@/features/finance/shared/scope";
import { projectAccess, projectVisibilityCondition } from "@/features/projects/scope";
import { targetScope } from "@/features/targets/scope";
import type { ReportFilters } from "../types";
import { ACQUISITION_SOURCES, getAcquisitionSource } from "@/features/crm/leads/acquisition-source";
import { nextDate } from "../shared/filters";

/** Draft expenses are unsubmitted work-in-progress and rejected ones were refused; neither is recorded spend. */
export const RECORDED_EXPENSE_STATUSES: Array<"submitted" | "approved"> = ["submitted", "approved"];

function requestedDepartments(actor: AuthorizationActor, filters: ReportFilters) {
  if (!filters.departmentIds.length) return actor.departmentIds;
  return filters.departmentIds.filter((id) => actor.departmentIds.includes(id));
}

function crmScopeCondition(actor: AuthorizationActor, table: typeof leads | typeof deals | typeof clients, filters: ReportFilters) {
  const scope = getCrmScope(actor);
  if (scope.kind === "global") return filters.departmentIds.length ? inArray(table.departmentId, filters.departmentIds) : undefined;
  if (scope.kind === "department") {
    const departments = requestedDepartments(actor, filters);
    return departments.length ? inArray(table.departmentId, departments) : sql`false`;
  }
  return and(eq(table.ownerId, actor.userId), filters.departmentIds.length ? inArray(table.departmentId,filters.departmentIds) : undefined);
}

function financeScopeCondition(actor: AuthorizationActor, table: typeof invoices | typeof payments, filters: ReportFilters) {
  const scope = financeScope(actor);
  if (scope.kind === "global") return filters.departmentIds.length ? inArray(table.departmentId, filters.departmentIds) : undefined;
  if (scope.kind === "department") {
    const departments = requestedDepartments(actor, filters);
    return departments.length ? inArray(table.departmentId, departments) : sql`false`;
  }
  return and(eq(table.ownerId, actor.userId), filters.departmentIds.length ? inArray(table.departmentId,filters.departmentIds) : undefined);
}

function projectScopeCondition(actor: AuthorizationActor, filters: ReportFilters) {
  const access = projectAccess(actor);
  const departmentIds = requestedDepartments(actor, filters);
  const departmentCondition = access.kind === "global" ? (filters.departmentIds.length ? inArray(projects.departmentId, filters.departmentIds) : undefined) : access.kind === "department" ? departmentIds.length ? inArray(projects.departmentId, departmentIds) : sql`false` : undefined;
  return and(projectVisibilityCondition(access), departmentCondition);
}

function currencyCondition(column: typeof invoices.currencyCode | typeof payments.currencyCode, currencies: string[]) { return currencies.length ? inArray(column, currencies) : undefined; }

export async function getLeadMetrics(actor: AuthorizationActor, filters: ReportFilters) {
  const base = and(isNull(leads.archivedAt), crmScopeCondition(actor, leads, filters));
  const createdInPeriod = and(base, gte(leads.createdAt, new Date(`${filters.periodFrom}T00:00:00.000Z`)), lt(leads.createdAt, new Date(`${nextDate(filters.periodTo)}T00:00:00.000Z`)));
  const [funnelRows, createdRows, convertedRows] = await Promise.all([
    db.select({ status: leads.status, total: count() }).from(leads).where(base).groupBy(leads.status),
    db.select({ id: leads.id, status: leads.status, convertedAt: leads.convertedAt, source: leads.source, sourceDetails: leads.sourceDetails }).from(leads).where(createdInPeriod),
    db.select({ id: leads.id }).from(leads).where(and(base, isNotNull(leads.convertedAt), gte(leads.convertedAt, new Date(`${filters.periodFrom}T00:00:00.000Z`)), lt(leads.convertedAt, new Date(`${nextDate(filters.periodTo)}T00:00:00.000Z`)))),
  ]);
  const sourceRows = createdRows.length ? await db.select({ leadId: leadSourceHistory.leadId, source: leadSourceHistory.source, recordedAt: leadSourceHistory.recordedAt, historyId: leadSourceHistory.id }).from(leadSourceHistory).where(inArray(leadSourceHistory.leadId, db.select({ id: leads.id }).from(leads).where(createdInPeriod))).orderBy(leadSourceHistory.leadId, leadSourceHistory.recordedAt, leadSourceHistory.id) : [];
  const firstSource = new Map<string, string>();
  for (const row of sourceRows) if (!firstSource.has(row.leadId)) firstSource.set(row.leadId, row.source);
  const sourcePerformance = new Map<string, { createdLeads: number; qualifiedSnapshot: number; convertedCohort: number }>();
  const inboundSources = ACQUISITION_SOURCES.map((source) => ({ source, count: 0 }));
  const asOf = new Date(`${filters.asOfDate}T23:59:59.999Z`);
  for (const lead of createdRows) {
    const acquisitionSource = getAcquisitionSource(lead.source, lead.sourceDetails);
    const inbound = inboundSources.find((row) => row.source === acquisitionSource);
    if (inbound) inbound.count += 1;
    const source = firstSource.get(lead.id) ?? "unknown";
    const current = sourcePerformance.get(source) ?? { createdLeads: 0, qualifiedSnapshot: 0, convertedCohort: 0 };
    current.createdLeads += 1;
    if (lead.status === "qualified") current.qualifiedSnapshot += 1;
    if (lead.convertedAt && lead.convertedAt <= asOf) current.convertedCohort += 1;
    sourcePerformance.set(source, current);
  }
  return { inboundSources, createdLeads: createdRows.length, convertedInPeriod: convertedRows.length, funnel: Object.fromEntries(funnelRows.map((row) => [row.status, Number(row.total)])), sourcePerformance: [...sourcePerformance.entries()].map(([source, values]) => ({ source, ...values, conversionRate: values.createdLeads ? Number((values.convertedCohort / values.createdLeads).toFixed(4)) : 0 })).sort((left, right) => right.createdLeads - left.createdLeads) };
}

export async function getDealMetrics(actor: AuthorizationActor, filters: ReportFilters) {
  const rows = await db.select({ stage: deals.stage, currency: deals.currency, total: sql<string>`coalesce(sum(${deals.expectedValue}), 0)`, count: count() }).from(deals).where(and(isNull(deals.archivedAt), crmScopeCondition(actor, deals, filters), filters.currencyCodes.length ? inArray(deals.currency, filters.currencyCodes) : undefined)).groupBy(deals.stage, deals.currency);
  const open = rows.filter(row=>row.stage !== "won" && row.stage !== "lost");
  return { closedWon: rows.filter(row=>row.stage === "won").map(row=>({ currency: row.currency, total: row.total, count: Number(row.count) })), lostCount: rows.filter(row=>row.stage === 'lost').reduce((sum,row)=>sum+Number(row.count),0), wonCount: rows.filter(row=>row.stage === "won").reduce((sum,row)=>sum+Number(row.count),0), openDealCount: open.reduce((total, row) => total + Number(row.count), 0), pipelineByStage: open.map((row) => ({ stage: row.stage, currency: row.currency, total: row.total, count: Number(row.count) })) };
}

export async function getDeliveryMetrics(actor: AuthorizationActor, filters: ReportFilters) {
  const projectWhere = and(isNull(projects.archivedAt), projectScopeCondition(actor, filters));
  const taskWhere = and(isNull(tasks.archivedAt), isNull(projects.archivedAt), projectScopeCondition(actor, filters));
  const [projectRows, taskRows, [{ overdueTasks }], [{ overdueProjects }], pendingTasks, overdueTaskList] = await Promise.all([
    db.select({ status: projects.status, total: count() }).from(projects).where(projectWhere).groupBy(projects.status),
    db.select({ status: tasks.status, total: count() }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(taskWhere).groupBy(tasks.status),
    db.select({ overdueTasks: count() }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(and(taskWhere, lt(tasks.dueDate, filters.asOfDate), notInArray(tasks.status, ["done", "canceled"]))),
    db.select({ overdueProjects: count() }).from(projects).where(and(projectWhere, lt(projects.dueDate, filters.asOfDate), notInArray(projects.status, ["completed", "canceled"]))),
    db.select({id:tasks.id,title:tasks.title,projectId:tasks.projectId,due:tasks.dueDate,status:tasks.status}).from(tasks).innerJoin(projects,eq(projects.id,tasks.projectId)).where(and(taskWhere,notInArray(tasks.status,["done","canceled"]))).orderBy(tasks.dueDate,tasks.id).limit(10),
    db.select({id:tasks.id,title:tasks.title,projectId:tasks.projectId,projectName:projects.name,due:tasks.dueDate,status:tasks.status,priority:tasks.priority}).from(tasks).innerJoin(projects,eq(projects.id,tasks.projectId)).where(and(taskWhere,lt(tasks.dueDate,filters.asOfDate),notInArray(tasks.status,["done","canceled"]))).orderBy(tasks.dueDate,tasks.id).limit(6),
  ]);
  return { overdueTaskList, pendingTasks, projectStatus: Object.fromEntries(projectRows.map((row) => [row.status, Number(row.total)])), taskStatus: Object.fromEntries(taskRows.map((row) => [row.status, Number(row.total)])), overdueTasks: Number(overdueTasks), overdueProjects: Number(overdueProjects) };
}

export async function getFinanceMetrics(actor: AuthorizationActor, filters: ReportFilters) {
  const invoiceScope = financeScopeCondition(actor, invoices, filters);
  const paymentScope = financeScopeCondition(actor, payments, filters);
  const issuedBase = and(invoiceScope, isNotNull(invoices.issuedAt), notInArray(invoices.status, ["draft", "voided"]), gte(invoices.issuedAt, new Date(`${filters.periodFrom}T00:00:00.000Z`)), lt(invoices.issuedAt, new Date(`${nextDate(filters.periodTo)}T00:00:00.000Z`)), currencyCondition(invoices.currencyCode, filters.currencyCodes));
  const paymentBase = and(paymentScope, eq(payments.status, "posted"), gte(payments.receivedAt, new Date(`${filters.periodFrom}T00:00:00.000Z`)), lt(payments.receivedAt, new Date(`${nextDate(filters.periodTo)}T00:00:00.000Z`)), currencyCondition(payments.currencyCode, filters.currencyCodes));
  const paidByInvoice = db.select({ invoiceId: paymentAllocations.invoiceId, paidMinor: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmountMinor}), 0)`.as("paidMinor") }).from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId)).where(eq(payments.status, "posted")).groupBy(paymentAllocations.invoiceId).as("paid_by_invoice");
  const receivableBase = and(invoiceScope, isNotNull(invoices.issuedAt), notInArray(invoices.status, ["draft", "voided"]), currencyCondition(invoices.currencyCode, filters.currencyCodes));
  const overdueBase = and(receivableBase, lt(invoices.dueDate, filters.asOfDate));
  const day = sql<string>`to_char(${payments.receivedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const [issuedRows, paymentRows, receivableRows, overdueRows, dailyCredits, clientInvoices, clientPayments, statuses, [unpaid], openInvoices, [overdue]] = await Promise.all([
    db.select({ currency: invoices.currencyCode, count: count(), totalMinor: sql<string>`coalesce(sum(${invoices.totalMinor}), 0)` }).from(invoices).where(issuedBase).groupBy(invoices.currencyCode),
    db.select({ currency: payments.currencyCode, count: count(), totalMinor: sql<string>`coalesce(sum(${payments.amountMinor}), 0)` }).from(payments).where(paymentBase).groupBy(payments.currencyCode),
    db.select({ currency: invoices.currencyCode, outstandingMinor: sql<string>`coalesce(sum(greatest(${invoices.totalMinor} - coalesce(${paidByInvoice.paidMinor}, 0), 0)), 0)` }).from(invoices).leftJoin(paidByInvoice, eq(paidByInvoice.invoiceId, invoices.id)).where(receivableBase).groupBy(invoices.currencyCode),
    db.select({ currency: invoices.currencyCode, outstandingMinor: sql<string>`coalesce(sum(greatest(${invoices.totalMinor} - coalesce(${paidByInvoice.paidMinor}, 0), 0)), 0)` }).from(invoices).leftJoin(paidByInvoice, eq(paidByInvoice.invoiceId, invoices.id)).where(overdueBase).groupBy(invoices.currencyCode),
    db.select({ day, currency: payments.currencyCode, amount: sql<string>`sum(${payments.amountMinor})` }).from(payments).where(paymentBase).groupBy(day, payments.currencyCode),
    db.select({ id: clients.id, name: clients.name, currency: invoices.currencyCode,
      billed: sql<string>`sum(${invoices.totalMinor})`,
      due: sql<string>`sum(greatest(${invoices.totalMinor} - coalesce(${paidByInvoice.paidMinor}, 0), 0))`
    }).from(invoices).innerJoin(clients, eq(invoices.clientId, clients.id)).leftJoin(paidByInvoice, eq(paidByInvoice.invoiceId, invoices.id)).where(receivableBase).groupBy(clients.id, clients.name, invoices.currencyCode),
    db.select({ id: clients.id, name: clients.name, currency: payments.currencyCode, received: sql<string>`sum(${payments.amountMinor})` })
      .from(payments).innerJoin(clients, eq(payments.clientId, clients.id)).where(and(paymentScope, eq(payments.status, "posted"), currencyCondition(payments.currencyCode, filters.currencyCodes))).groupBy(clients.id, clients.name, payments.currencyCode),
    db.select({status:invoices.status, count:count()}).from(invoices).where(and(invoiceScope,currencyCondition(invoices.currencyCode,filters.currencyCodes))).groupBy(invoices.status),
    db.select({total:count()}).from(invoices).leftJoin(paidByInvoice,eq(invoices.id,paidByInvoice.invoiceId)).where(and(receivableBase,sql`${invoices.totalMinor} > coalesce(${paidByInvoice.paidMinor},0)`)),
    db.select({id:invoices.id,title:invoices.title,due:invoices.dueDate,currency:invoices.currencyCode,amount:sql<string>`${invoices.totalMinor} - coalesce(${paidByInvoice.paidMinor},0)`}).from(invoices).leftJoin(paidByInvoice,eq(invoices.id,paidByInvoice.invoiceId)).where(and(receivableBase,sql`${invoices.totalMinor} > coalesce(${paidByInvoice.paidMinor},0)`)).orderBy(invoices.dueDate,invoices.id).limit(10),
    db.select({total:count()}).from(invoices).leftJoin(paidByInvoice,eq(invoices.id,paidByInvoice.invoiceId)).where(and(overdueBase,sql`${invoices.totalMinor} > coalesce(${paidByInvoice.paidMinor},0)`)),
  ]);
  const balances = new Map(clientInvoices.map(row => [row.id + row.currency, {...row, received: "0"}]));
  for (const row of clientPayments) {
    const key = row.id + row.currency;
    balances.set(key, {...(balances.get(key) ?? {billed: "0", due: "0"}), ...row});
  }
  return { overdueCount:Number(overdue.total), unpaidCount:Number(unpaid.total),openInvoices,statuses, dailyCredits, balances: [...balances.values()].sort((a,b) => a.name.localeCompare(b.name)), issuedInvoices: issuedRows.map((row) => ({ currency: row.currency, count: Number(row.count), totalMinor: row.totalMinor })), paymentsReceived: paymentRows.map((row) => ({ currency: row.currency, count: Number(row.count), totalMinor: row.totalMinor })), receivables: receivableRows.map((row) => ({ currency: row.currency, outstandingMinor: row.outstandingMinor })), overdueReceivables: overdueRows.map((row) => ({ currency: row.currency, outstandingMinor: row.outstandingMinor })) };
}

async function actualForTarget(actor: AuthorizationActor, target: typeof departmentTargets.$inferSelect) {
  if (target.metricKey === "leads_created" && !can(actor, PERMISSIONS.CRM_LEADS_READ)) return { actualCount: null, actualMinor: null };
  if (target.metricKey === "tasks_completed" && (!can(actor, PERMISSIONS.PROJECTS_READ) || !can(actor, PERMISSIONS.TASKS_READ))) return { actualCount: null, actualMinor: null };
  if (target.metricKey === "invoices_issued_minor" && !can(actor, PERMISSIONS.INVOICES_READ)) return { actualCount: null, actualMinor: null };
  if (target.metricKey === "payments_received_minor" && !can(actor, PERMISSIONS.PAYMENTS_READ)) return { actualCount: null, actualMinor: null };
  const range = { from: new Date(`${target.periodStart}T00:00:00.000Z`), to: new Date(`${nextDate(target.periodEnd)}T00:00:00.000Z`) };
  if (target.metricKey === "leads_created") {
    const [row] = await db.select({ value: count() }).from(leads).where(and(isNull(leads.archivedAt), eq(leads.departmentId, target.departmentId), gte(leads.createdAt, range.from), lt(leads.createdAt, range.to)));
    return { actualCount: Number(row?.value ?? 0), actualMinor: null };
  }
  if (target.metricKey === "tasks_completed") {
    const [row] = await db.select({ value: count() }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(and(isNull(tasks.archivedAt), isNull(projects.archivedAt), eq(projects.departmentId, target.departmentId), eq(tasks.status, "done"), isNotNull(tasks.completedAt), gte(tasks.completedAt, range.from), lt(tasks.completedAt, range.to)));
    return { actualCount: Number(row?.value ?? 0), actualMinor: null };
  }
  if (target.metricKey === "invoices_issued_minor") {
    const [row] = await db.select({ value: sql<string>`coalesce(sum(${invoices.totalMinor}), 0)` }).from(invoices).where(and(eq(invoices.departmentId, target.departmentId), eq(invoices.currencyCode, target.currencyCode ?? ""), isNotNull(invoices.issuedAt), notInArray(invoices.status, ["draft", "voided"]), gte(invoices.issuedAt, range.from), lt(invoices.issuedAt, range.to)));
    return { actualCount: null, actualMinor: row?.value ?? "0" };
  }
  const [row] = await db.select({ value: sql<string>`coalesce(sum(${payments.amountMinor}), 0)` }).from(payments).where(and(eq(payments.departmentId, target.departmentId), eq(payments.currencyCode, target.currencyCode ?? ""), eq(payments.status, "posted"), gte(payments.receivedAt, range.from), lt(payments.receivedAt, range.to)));
  return { actualCount: null, actualMinor: row?.value ?? "0" };
}

export async function getTargetActualMetrics(actor: AuthorizationActor, filters: ReportFilters) {
  const month = filters.periodFrom.slice(0, 7);
  const periodStart = `${month}-01`;
  const periodEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const scope = targetScope(actor);
  const departmentFilter = scope.kind === "global" ? (filters.departmentIds.length ? inArray(departmentTargets.departmentId, filters.departmentIds) : undefined) : scope.kind === "department" ? (() => { const ids = filters.departmentIds.length ? filters.departmentIds.filter((id) => scope.departmentIds.includes(id)) : scope.departmentIds; return ids.length ? inArray(departmentTargets.departmentId, ids) : sql`false`; })() : sql`false`;
  const targets = await db.select({ target: departmentTargets, departmentName: departments.name }).from(departmentTargets).innerJoin(departments, eq(departments.id, departmentTargets.departmentId)).where(and(eq(departmentTargets.periodStart, periodStart), eq(departmentTargets.periodEnd, periodEnd), departmentFilter));
  const items = await Promise.all(targets.map(async ({ target, departmentName }) => { const actual = await actualForTarget(actor, target); return { id: target.id, departmentId: target.departmentId, departmentName, metricKey: target.metricKey, periodStart: target.periodStart, periodEnd: target.periodEnd, unit: target.unit, currencyCode: target.currencyCode, targetCount: target.targetCount, targetMinor: target.targetMinor, actualCount: actual.actualCount, actualMinor: actual.actualMinor, varianceCount: target.targetCount === null || actual.actualCount === null ? null : actual.actualCount - target.targetCount, varianceMinor: target.targetMinor === null || actual.actualMinor === null ? null : (BigInt(actual.actualMinor) - BigInt(target.targetMinor)).toString() }; }));
  return { items };
}

export async function getRecentAuditEvents(filters: ReportFilters) {
  const rows = await db.select({
    id: auditLogs.id,
    actorUserId: auditLogs.actorUserId, actorName: sql<string | null>`coalesce(${users.name},${users.email})`,
    action: auditLogs.action,
    resourceType: auditLogs.resourceType,
    resourceId: auditLogs.resourceId,
    outcome: auditLogs.outcome,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs).leftJoin(users,eq(users.id,auditLogs.actorUserId)).where(and(
    gte(auditLogs.createdAt, new Date(`${filters.periodFrom}T00:00:00.000Z`)),
    lt(auditLogs.createdAt, new Date(`${nextDate(filters.periodTo)}T00:00:00.000Z`)),
  )).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(50);

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getExpenseBreakdown(actor: AuthorizationActor, filters: ReportFilters) {
  return db.select({day: expenses.incurredOn, currency: expenses.currencyCode, category: expenses.category,
    amount: sql<string>`sum(${expenses.amountMinor})`}).from(expenses).where(and(
      expenseScopeCondition(expenseScope(actor)), inArray(expenses.status, RECORDED_EXPENSE_STATUSES),
      gte(expenses.incurredOn, filters.periodFrom), lt(expenses.incurredOn, nextDate(filters.periodTo)),
      filters.currencyCodes.length ? inArray(expenses.currencyCode, filters.currencyCodes) : undefined,
      filters.departmentIds.length ? inArray(expenses.departmentId, filters.departmentIds) : undefined,
    )).groupBy(expenses.incurredOn, expenses.currencyCode, expenses.category);
}

export async function getClientCount(actor: AuthorizationActor, filters: ReportFilters) {
  const [row] = await db.select({total:count(),active:sql<number>`count(*) filter (where ${clients.archivedAt} is null)`.mapWith(Number)}).from(clients).where(crmScopeCondition(actor,clients,filters));
  return row;
}

export async function getLedgerProfit(filters: ReportFilters) {
  const linkedDepartment = sql`coalesce(${expenses.departmentId},${invoices.departmentId},${payments.departmentId})::text`;
  const origin = db.select({entryId:journalEntrySources.journalEntryId,
    department:sql<string|null>`case when count(distinct ${linkedDepartment}) = 1 and count(${linkedDepartment}) = count(*) then min(${linkedDepartment}) end`.as("department")
  }).from(journalEntrySources)
    .leftJoin(expenses,and(eq(journalEntrySources.sourceType,"expense"),sql`${expenses.id}::text = ${journalEntrySources.sourceId}`))
    .leftJoin(invoices,and(eq(journalEntrySources.sourceType,"invoice"),sql`${invoices.id}::text = ${journalEntrySources.sourceId}`))
    .leftJoin(payments,and(eq(journalEntrySources.sourceType,"payment"),sql`${payments.id}::text = ${journalEntrySources.sourceId}`))
    .groupBy(journalEntrySources.journalEntryId).as("entry_origin");
  return db.select({departmentId:origin.department,currency:journalEntries.currencyCode,amount:sql<string>`sum(${journalEntryLines.creditMinor} - ${journalEntryLines.debitMinor})`})
    .from(journalEntries).leftJoin(origin,sql`${origin.entryId} = coalesce(${journalEntries.reversalOfId},${journalEntries.id})`).innerJoin(journalEntryLines,eq(journalEntryLines.journalEntryId,journalEntries.id))
    .innerJoin(accountingAccounts,eq(accountingAccounts.id,journalEntryLines.accountId))
    .where(and(inArray(journalEntries.status,["posted","reversed"]),inArray(accountingAccounts.accountType,["revenue","expense"]),
      // Reference the subquery column explicitly; a bare "department" is not resolvable in the outer query.
      filters.departmentIds.length ? inArray(sql`"entry_origin"."department"`, filters.departmentIds) : undefined,
      gte(journalEntries.entryDate,filters.periodFrom),lt(journalEntries.entryDate,nextDate(filters.periodTo)),
      filters.currencyCodes.length ? inArray(journalEntries.currencyCode,filters.currencyCodes) : undefined))
    .groupBy(origin.department,journalEntries.currencyCode);
}
export async function getDepartmentPerformance(actor: AuthorizationActor, filters: ReportFilters) {
  const start = new Date(filters.periodFrom + "T00:00:00Z");
  const end = new Date(nextDate(filters.periodTo) + "T00:00:00Z");
  const [cash, spend, pipeline, customers] = await Promise.all([
    db.select({id:payments.departmentId,currency:payments.currencyCode,value:sql<string>`sum(${payments.amountMinor})`}).from(payments)
      .where(and(financeScopeCondition(actor,payments,filters),eq(payments.status,"posted"),gte(payments.receivedAt,start),lt(payments.receivedAt,end),currencyCondition(payments.currencyCode,filters.currencyCodes))).groupBy(payments.departmentId,payments.currencyCode),
    db.select({id:expenses.departmentId,currency:expenses.currencyCode,value:sql<string>`sum(${expenses.amountMinor})`}).from(expenses)
      .where(and(expenseScopeCondition(expenseScope(actor)),inArray(expenses.status,RECORDED_EXPENSE_STATUSES),gte(expenses.incurredOn,filters.periodFrom),lt(expenses.incurredOn,nextDate(filters.periodTo)),filters.departmentIds.length?inArray(expenses.departmentId,filters.departmentIds):undefined,filters.currencyCodes.length?inArray(expenses.currencyCode,filters.currencyCodes):undefined)).groupBy(expenses.departmentId,expenses.currencyCode),
    db.select({id:deals.departmentId,currency:deals.currency,value:sql<string>`sum(${deals.expectedValue})`}).from(deals)
      .where(and(crmScopeCondition(actor,deals,filters),isNull(deals.archivedAt),notInArray(deals.stage,["won","lost"]),filters.currencyCodes.length?inArray(deals.currency,filters.currencyCodes):undefined)).groupBy(deals.departmentId,deals.currency),
    db.select({id:clients.departmentId,value:count()}).from(clients).where(and(crmScopeCondition(actor,clients,filters),isNull(clients.archivedAt))).groupBy(clients.departmentId)
  ]);
  return {cash,spend,pipeline,customers};
}

export async function getFounderOperations(actor: AuthorizationActor, filters: ReportFilters) {
  const from = new Date(filters.periodFrom+"T00:00:00Z");
  const to = new Date(nextDate(filters.periodTo)+"T00:00:00Z");
  const [followups,latestDeals,recentPayments,recentExpenses,topClients] = await Promise.all([
    can(actor,PERMISSIONS.CRM_LEADS_READ) ? db.select({id:leads.id,name:leads.contactName,detail:leads.nextAction,due:leads.nextActionAt}).from(leads)
      .where(and(crmScopeCondition(actor,leads,filters),isNull(leads.archivedAt),isNull(leads.convertedAt),isNotNull(leads.nextActionAt),gte(leads.nextActionAt,new Date(filters.asOfDate+"T00:00:00Z"))))
      .orderBy(leads.nextActionAt,leads.id).limit(6) : undefined,
    can(actor,PERMISSIONS.CRM_DEALS_READ) ? db.select({id:deals.id,name:deals.title,stage:deals.stage,value:deals.expectedValue,currency:deals.currency,createdAt:deals.createdAt}).from(deals)
      .where(and(crmScopeCondition(actor,deals,filters),isNull(deals.archivedAt),gte(deals.createdAt,from),lt(deals.createdAt,to),filters.currencyCodes.length?inArray(deals.currency,filters.currencyCodes):undefined))
      .orderBy(desc(deals.createdAt),deals.id).limit(6) : undefined,
    can(actor,PERMISSIONS.PAYMENTS_READ) ? db.select({id:payments.id,clientId:payments.clientId,name:clients.name,currency:payments.currencyCode,amount:payments.amountMinor,date:payments.receivedAt}).from(payments).innerJoin(clients,eq(clients.id,payments.clientId))
      .where(and(financeScopeCondition(actor,payments,filters),eq(payments.status,"posted"),gte(payments.receivedAt,from),lt(payments.receivedAt,to),currencyCondition(payments.currencyCode,filters.currencyCodes))).orderBy(desc(payments.receivedAt),payments.id).limit(6) : undefined,
    can(actor,PERMISSIONS.EXPENSES_READ) ? db.select({id:expenses.id,name:expenses.description,category:expenses.category,status:expenses.status,currency:expenses.currencyCode,amount:expenses.amountMinor,date:expenses.incurredOn}).from(expenses)
      .where(and(expenseScopeCondition(expenseScope(actor)),notInArray(expenses.status,["rejected"]),gte(expenses.incurredOn,filters.periodFrom),lt(expenses.incurredOn,nextDate(filters.periodTo)),filters.departmentIds.length?inArray(expenses.departmentId,filters.departmentIds):undefined,filters.currencyCodes.length?inArray(expenses.currencyCode,filters.currencyCodes):undefined)).orderBy(desc(expenses.incurredOn),desc(expenses.createdAt),expenses.id).limit(6) : undefined,
    can(actor,PERMISSIONS.PAYMENTS_READ) ? db.select({id:clients.id,name:clients.name,currency:payments.currencyCode,amount:sql<string>`sum(${payments.amountMinor})`}).from(payments).innerJoin(clients,eq(clients.id,payments.clientId))
      .where(and(financeScopeCondition(actor,payments,filters),eq(payments.status,"posted"),gte(payments.receivedAt,from),lt(payments.receivedAt,to),currencyCondition(payments.currencyCode,filters.currencyCodes)))
      .groupBy(clients.id,clients.name,payments.currencyCode).orderBy(desc(sql`sum(${payments.amountMinor})`),payments.currencyCode,clients.id).limit(8) : undefined
  ]);
  return {followups,latestDeals,recentPayments,recentExpenses,topClients};
}

/** Last 12 calendar months (ending with the period's final month) of posted collections and recorded spend, per currency. */
export async function getMonthlyTrend(actor: AuthorizationActor, filters: ReportFilters) {
  const end = new Date(`${filters.periodTo.slice(0, 7)}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 12);
  const months: string[] = [];
  for (const cursor = new Date(start); cursor < end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) months.push(cursor.toISOString().slice(0, 7));
  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);
  const paymentMonth = sql<string>`to_char(${payments.receivedAt} at time zone 'UTC', 'YYYY-MM')`;
  const expenseMonth = sql<string>`to_char(${expenses.incurredOn}, 'YYYY-MM')`;
  const [credits, spend] = await Promise.all([
    can(actor, PERMISSIONS.PAYMENTS_READ)
      ? db.select({ month: paymentMonth, currency: payments.currencyCode, amount: sql<string>`sum(${payments.amountMinor})` }).from(payments)
        .where(and(financeScopeCondition(actor, payments, filters), eq(payments.status, "posted"), gte(payments.receivedAt, start), lt(payments.receivedAt, end), currencyCondition(payments.currencyCode, filters.currencyCodes)))
        .groupBy(paymentMonth, payments.currencyCode)
      : Promise.resolve(undefined),
    can(actor, PERMISSIONS.EXPENSES_READ)
      ? db.select({ month: expenseMonth, currency: expenses.currencyCode, amount: sql<string>`sum(${expenses.amountMinor})` }).from(expenses)
        .where(and(expenseScopeCondition(expenseScope(actor)), inArray(expenses.status, RECORDED_EXPENSE_STATUSES), gte(expenses.incurredOn, startDay), lt(expenses.incurredOn, endDay),
          filters.departmentIds.length ? inArray(expenses.departmentId, filters.departmentIds) : undefined,
          filters.currencyCodes.length ? inArray(expenses.currencyCode, filters.currencyCodes) : undefined))
        .groupBy(expenseMonth, expenses.currencyCode)
      : Promise.resolve(undefined),
  ]);
  return { months, credits, spend };
}
