import { DashboardReportView } from "@/features/reports/components/DashboardReportView";
import { reportsService } from "@/features/reports/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const actor = await requirePagePermission(PERMISSIONS.REPORTS_READ); const filters = await searchParams; let data; let errorMessage: string | null = null; try { data = await reportsService.dashboard(actor, filters); } catch (error) { errorMessage = error instanceof Error ? error.message : "The report could not be loaded."; } if (data) return <DashboardReportView data={data} action="/reports" />; return <section className="panel"><h1 className="text-2xl font-semibold">Reports unavailable</h1><p className="mt-2 text-sm text-text-muted">{errorMessage}</p></section>; }
