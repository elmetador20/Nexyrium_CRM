import {WhatsAppStatus} from "@/features/integrations/whatsapp/WhatsAppStatus";
import Link from "next/link";
import { ArrowRight, HardDrive, Megaphone } from "lucide-react";

import { getDriveReadiness } from "@/features/integrations/google-drive/connection";
import { PageHeader, StatusBadge } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function IntegrationsPage() {
  const actor = await requirePagePermission(PERMISSIONS.SETTINGS_READ);
  const drive = await getDriveReadiness();
  const cards = [
    {
      href: "/settings/integrations/google-drive",
      title: "Google Drive",
      body: "Stores expense receipts and private documents in your Drive folder (limited drive.file access).",
      Icon: HardDrive,
      status: drive.ready ? <StatusBadge tone="success">Connected</StatusBadge> : <StatusBadge tone="warning">{drive.reason === "folder_not_authorized" ? "Choose folder" : drive.reason === "not_connected" ? "Not connected" : "Setup needed"}</StatusBadge>,
      detail: drive.ready ? `Saving to “${drive.folderName ?? "receipts folder"}” as ${drive.accountEmail}` : drive.message,
    },
    can(actor, PERMISSIONS.INTEGRATIONS_META_READ) && {
      href: "/settings/integrations/meta",
      title: "Meta Lead Ads",
      body: "Receive leads from Facebook and Instagram lead forms.",
      Icon: Megaphone,
      status: null,
      detail: "Webhook readiness and delivery history",
    },
  ].filter(Boolean) as Array<{ href: string; title: string; body: string; Icon: typeof HardDrive; status: React.ReactNode; detail: string }>;

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/settings", label: "Settings" }} eyebrow="Workspace" title="Integrations" description="Connect NEXYRIUM to the services your team already uses." />
      <ul className="grid gap-3">
        {cards.map(({ href, title, body, Icon, status, detail }) => (
          <li key={href}>
            <Link href={href} className="nx-card-interactive flex items-start gap-4 rounded-[14px] border border-border bg-surface p-4 no-underline hover:no-underline sm:p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary" aria-hidden><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-text-primary">{title}</span>{status}</span>
                <span className="mt-0.5 block text-sm text-text-secondary">{body}</span>
                <span className="mt-1.5 block text-xs text-text-muted">{detail}</span>
              </span>
              <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {can(actor, PERMISSIONS.SETTINGS_MANAGE) && <WhatsAppStatus/>}
    </section>
  );
}
