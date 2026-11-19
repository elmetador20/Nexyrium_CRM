import { requirePagePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { reportsService } from "../server";
import { DashboardReportView } from "./DashboardReportView";

export async function OverviewPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const actor = await requirePagePermission(PERMISSIONS.REPORTS_READ);
  const data = await reportsService.dashboard(actor,await searchParams);
  return <DashboardReportView data={data}/>;
}
