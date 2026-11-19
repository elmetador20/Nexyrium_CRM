import Link from "next/link";

import { MetaIntegrationStatus } from "@/features/integrations/meta/components/MetaIntegrationStatus";
import { metaIntegrationService } from "@/features/integrations/meta";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function MetaIntegrationPage() {
  await requirePagePermission(PERMISSIONS.INTEGRATIONS_META_READ);
  const status = await metaIntegrationService.status({ page: 1, pageSize: 20 });
  const initial = { ...status, events: { ...status.events, items: status.events.items.map((event) => ({ ...event, receivedAt: event.receivedAt.toISOString() })) } };
  return <section className="mx-auto max-w-6xl"><Link href="/settings/integrations" className="text-sm text-text-muted hover:underline">← Integrations</Link><div className="mt-5"><h2 className="text-2xl font-semibold">Meta Lead Ads integration</h2><p className="mt-2 text-sm text-text-muted">Monitor server-side webhook readiness, delivery failures, and safe retries. No external webhook is activated by this page.</p></div><div className="mt-8"><MetaIntegrationStatus initial={initial} /></div><div className="mt-8 rounded-xl border border-border bg-surface p-5 text-sm"><h3 className="font-semibold">Configuration checklist</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-text-secondary"><li>Create or select a Meta app in Meta for Developers and keep the App Secret in the server environment only.</li><li>Give the app access to the Facebook Page that owns the Lead Ad form, and request the Lead Ads permissions required by Meta for lead retrieval and Page webhook subscriptions.</li><li>Configure the callback URL as <code>/api/v1/webhooks/meta</code> on the deployed HTTPS origin and use the exact server-side verify token.</li><li>Subscribe the Page to the app&apos;s <code>leadgen</code> webhook field only after the environment variables are present and the synthetic tests pass.</li><li>Configure a Page access token and default CRM owner/department IDs if automatic lead assignment is desired.</li></ol><p className="mt-4 text-xs text-text-muted">This project does not create Meta apps, request permissions, store tokens, or activate subscriptions automatically.</p></div></section>;
}
