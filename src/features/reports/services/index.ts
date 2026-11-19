import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { getCrmScope } from '@/features/crm/shared/types';
import { getFounderOperations, getMonthlyTrend, getDepartmentPerformance, getLedgerProfit, getClientCount, getExpenseBreakdown, getDeliveryMetrics, getDealMetrics, getFinanceMetrics, getLeadMetrics, getRecentAuditEvents, getTargetActualMetrics } from "../queries";
import { reportFilterSchema } from "../schemas";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { normalizeReportFilters } from "../shared/filters";
import { ReportsError } from "../errors";
import type { DashboardMetrics } from "../types";

function unavailable(): { available: false; reason: "permission_denied" } { return { available: false, reason: "permission_denied" }; }

export function createReportsService() {
  return {
    async dashboard(actor: AuthorizationActor, rawInput: unknown): Promise<DashboardMetrics> {
      if (!can(actor, PERMISSIONS.REPORTS_READ)) throw new ReportsError("FORBIDDEN", "You cannot read reports.");
      let filters;
      try { filters = normalizeReportFilters(reportFilterSchema.parse(rawInput)); } catch (error) { throw new ReportsError("INVALID", error instanceof Error ? error.message : "Invalid report filters."); }
      const [leads, deals, delivery, finance, targets, auditEvents, expenses, clientCount, profit, departmentPerformance, operations, trend, departments] = await Promise.all([
        can(actor, PERMISSIONS.CRM_LEADS_READ) ? getLeadMetrics(actor, filters) : Promise.resolve(null),
        can(actor, PERMISSIONS.CRM_DEALS_READ) ? getDealMetrics(actor, filters) : Promise.resolve(null),
        can(actor, PERMISSIONS.PROJECTS_READ) && can(actor, PERMISSIONS.TASKS_READ) ? getDeliveryMetrics(actor, filters) : Promise.resolve(null),
        can(actor, PERMISSIONS.INVOICES_READ) && can(actor, PERMISSIONS.PAYMENTS_READ) ? getFinanceMetrics(actor, filters) : Promise.resolve(null),
        can(actor, PERMISSIONS.REPORTS_READ) ? getTargetActualMetrics(actor, filters) : Promise.resolve(null),
        can(actor, PERMISSIONS.AUDIT_LOGS_READ) ? getRecentAuditEvents(filters) : Promise.resolve(undefined),
        can(actor, PERMISSIONS.EXPENSES_READ) ? getExpenseBreakdown(actor, filters) : Promise.resolve(undefined),
        can(actor, PERMISSIONS.CRM_CLIENTS_READ) ? getClientCount(actor, filters) : Promise.resolve(undefined),
        can(actor,PERMISSIONS.ACCOUNTING_READ) && getCrmScope(actor).kind === "global" ? getLedgerProfit(filters) : Promise.resolve(undefined),
        getCrmScope(actor).kind === "global" && [PERMISSIONS.CRM_CLIENTS_READ,PERMISSIONS.CRM_DEALS_READ,PERMISSIONS.EXPENSES_READ,PERMISSIONS.PAYMENTS_READ].every(p=>can(actor,p)) ? getDepartmentPerformance(actor,filters) : Promise.resolve(undefined),
        getFounderOperations(actor, filters),
        getMonthlyTrend(actor, filters),
        workspaceDepartments(actor),
      ]);
      return { departments, trend, operations, departmentPerformance, profit, clientCount:clientCount?.active, allClientCount:clientCount?.total, actions: { expense: can(actor, PERMISSIONS.EXPENSES_CREATE), payment: can(actor, PERMISSIONS.PAYMENTS_CREATE) && can(actor, PERMISSIONS.INVOICES_READ), invoice: can(actor, PERMISSIONS.INVOICES_CREATE) }, expenses, auditEvents, filters: { ...filters, timezone: "UTC", attribution: "current_record_department" }, leads: leads ? { available: true, ...leads } : unavailable(), deals: deals ? { available: true, ...deals } : unavailable(), delivery: delivery ? { available: true, ...delivery } : unavailable(), finance: finance ? { available: true, ...finance } : unavailable(), targets: targets ? { available: true, ...targets } : unavailable() };
    },
  };
}
