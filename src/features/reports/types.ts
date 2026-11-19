import type { AcquisitionSource } from "@/features/crm/leads/acquisition-source";

export type ReportFilters = {
  periodFrom: string;
  periodTo: string;
  asOfDate: string;
  departmentIds: string[];
  currencyCodes: string[];
};

export type MetricAvailability = { available: true } | { available: false; reason: "permission_denied" };

export type AuditEventSummary = {
  id: string;
  actorName?: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  createdAt: string;
};

export type DashboardMetrics = {
  departments?: Array<{ id: string; name: string }>;
  trend?: Awaited<ReturnType<typeof import("./queries").getMonthlyTrend>>;
  operations?: Awaited<ReturnType<typeof import("./queries").getFounderOperations>>;
  departmentPerformance?: Awaited<ReturnType<typeof import("./queries").getDepartmentPerformance>>;
  profit?: Array<{departmentId:string|null;currency:string;amount:string}>;
  allClientCount?:number;
  clientCount?: number;
  actions?: { expense: boolean; payment: boolean; invoice: boolean };
  expenses?: Array<{ day: string; currency: string; category: string; amount: string }>;
  auditEvents?: AuditEventSummary[];
  filters: ReportFilters & { timezone: "UTC"; attribution: "current_record_department" };
  leads: (MetricAvailability & { createdLeads?: number; inboundSources?: Array<{ source: AcquisitionSource; count: number }>; convertedInPeriod?: number; funnel?: Record<string, number>; sourcePerformance?: Array<{ source: string; createdLeads: number; qualifiedSnapshot: number; convertedCohort: number; conversionRate: number }> });
  deals: (MetricAvailability & { closedWon?: Array<{ currency: string; total: string; count: number }>; lostCount?:number; wonCount?: number; openDealCount?: number; pipelineByStage?: Array<{ stage: string; currency: string; total: string; count: number }> });
  delivery: (MetricAvailability & { overdueTaskList?: Array<{id:string;title:string;projectId:string;projectName:string;due:string|null;status:string;priority:string}>; pendingTasks?:Array<{id:string;title:string;projectId:string;due:string|null;status:string}>; projectStatus?: Record<string, number>; taskStatus?: Record<string, number>; overdueTasks?: number; overdueProjects?: number });
  finance: (MetricAvailability & { overdueCount?: number; unpaidCount?:number;openInvoices?:Array<{id:string;title:string;due:string|null;currency:string;amount:string}>; statuses?: Array<{status:string;count:number}>; dailyCredits?: Array<{day: string; currency: string; amount: string}>; balances?: Array<{id: string; name: string; currency: string; billed: string; received: string; due: string}>; issuedInvoices?: Array<{ currency: string; count: number; totalMinor: string }>; paymentsReceived?: Array<{ currency: string; count: number; totalMinor: string }>; receivables?: Array<{ currency: string; outstandingMinor: string }>; overdueReceivables?: Array<{ currency: string; outstandingMinor: string }> });
  targets: (MetricAvailability & { items?: Array<{ id: string; departmentId: string; departmentName: string; metricKey: string; periodStart: string; periodEnd: string; unit: string; currencyCode: string | null; targetCount: number | null; targetMinor: string | null; actualCount: number | null; actualMinor: string | null; varianceCount: number | null; varianceMinor: string | null }> });
};
