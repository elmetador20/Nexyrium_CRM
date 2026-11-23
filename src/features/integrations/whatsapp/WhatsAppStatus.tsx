import { sql } from "drizzle-orm";
import { db } from "@/db";
import { routes } from "./contracts";

export async function WhatsAppStatus() {
  const [metrics] = (await db.execute<{created:number;duplicates:number;skipped:number;last_success:string|null;last_failure:string|null}>(sql`
    select count(*) filter(where outcome='created')::int as created,max(processed_at) as last_success,
      (select count(*)::int from audit_logs where action='ycloud.duplicate') as duplicates,
      (select count(*)::int from audit_logs where action like 'ycloud.skip.%') as skipped,
      (select max(created_at) from audit_logs where action='ycloud.failure') as last_failure
    from lead_intake_events where source='whatsapp' and idempotency_key like 'ycloud:%'
  `)).rows;
  return <section className="panel mt-4 space-y-3"><h2 className="font-semibold">WhatsApp lead intake</h2>
    <p>Webhook signing secret: {process.env.YCLOUD_WEBHOOK_SECRET ? "Configured":"Missing"}</p>
    {routes.map(r=><p key={r.slug}>{r.department} routing: {process.env[r.variable]?"Configured":"Missing account ID"}</p>)}
    <dl className="grid gap-2 sm:grid-cols-2">{Object.entries({"Leads created":metrics.created,"Duplicate deliveries":metrics.duplicates,"Skipped signed events":metrics.skipped,"Last processed":metrics.last_success,"Last processing failure":metrics.last_failure}).map(([k,v])=><div key={k}><dt className="text-xs text-text-muted">{k}</dt><dd>{String(v??"None")}</dd></div>)}</dl>
  </section>;
}
