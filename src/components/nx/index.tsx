import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * NEXYRIUM UI primitives. Server-component friendly (no client state), styled
 * with the shadcn/ui conventions (variants via props, `cn` composition) on top
 * of the brand tokens in globals.css.
 */

export function PageHeader({ eyebrow, title, description, actions, back }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 nx-fade-up">
      <div className="min-w-0">
        {back ? <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"><ChevronLeft className="h-4 w-4" aria-hidden />{back.label}</Link> : null}
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const toneIcon: Record<Tone, string> = {
  primary: "bg-primary-light text-primary",
  accent: "bg-accent-light text-accent",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-info-light text-info",
  neutral: "bg-surface-muted text-text-secondary",
};

export function StatCard({ label, value, hint, href, icon, tone = "primary", className }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; icon?: ReactNode; tone?: Tone; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.75rem] font-medium leading-snug text-text-secondary sm:text-[0.8rem]">{label}</p>
        {icon ? <span className={cn("hidden h-8 w-8 shrink-0 place-items-center rounded-lg min-[400px]:grid", toneIcon[tone])} aria-hidden>{icon}</span> : null}
      </div>
      <p className="mt-1.5 break-words text-[1.05rem] font-semibold sm:mt-2 sm:text-[1.4rem] leading-tight tracking-tight tabular-nums text-text-primary">{value}</p>
      {hint ? <p className="mt-1 line-clamp-2 text-[0.7rem] leading-snug text-text-muted sm:text-xs">{hint}</p> : null}
      {href ? <ArrowUpRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-text-muted opacity-0 transition group-hover:opacity-100" aria-hidden /> : null}
    </>
  );
  const classes = cn("group relative block min-w-0 rounded-[14px] border border-border bg-surface p-3 sm:p-4 shadow-[0_1px_2px_rgb(24_35_31/4%)]", href && "nx-card-interactive focus-visible:outline-primary", className);
  return href ? <Link href={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}

export function Panel({ title, description, action, children, id, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string; bodyClassName?: string }) {
  return (
    <section id={id} className={cn("min-w-0 rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgb(24_35_31/4%)]", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-[0.95rem] font-semibold text-text-primary">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0 text-sm">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{children}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center nx-grid-bg">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-light text-primary" aria-hidden>{icon ?? <Inbox className="h-5 w-5" />}</span>
      <h3 className="mt-4 font-semibold text-text-primary">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const statusTone: Record<string, Tone> = {
  new: "info", contacted: "info", qualified: "primary", converted: "success", disqualified: "neutral", lost: "danger", unqualified: "neutral",
  prospecting: "info", proposal: "accent", negotiation: "warning", won: "success",
  draft: "neutral", issued: "info", partially_paid: "warning", paid: "success", overdue: "danger", voided: "neutral",
  posted: "success", reversed: "neutral", refunded: "warning",
  submitted: "info", approved: "success", rejected: "danger",
  todo: "neutral", in_progress: "info", blocked: "danger", review: "accent", done: "success", canceled: "neutral",
  planned: "neutral", active: "primary", on_hold: "warning", completed: "success",
  success: "success", failure: "danger", denied: "danger",
  low: "neutral", medium: "info", high: "warning", urgent: "danger",
};

const toneBadge: Record<Tone, string> = {
  primary: "bg-primary-light text-primary ring-primary/15",
  accent: "bg-accent-light text-[#B4612A] ring-accent/20",
  success: "bg-success-light text-success ring-success/15",
  warning: "bg-warning-light text-warning ring-warning/15",
  danger: "bg-danger-light text-danger ring-danger/15",
  info: "bg-info-light text-info ring-info/15",
  neutral: "bg-surface-muted text-text-secondary ring-border",
};

export function StatusBadge({ status, tone, children }: { status?: string | null; tone?: Tone; children?: ReactNode }) {
  const resolved = tone ?? statusTone[status ?? ""] ?? "neutral";
  const text = children ?? (status ? status.replaceAll("_", " ") : "—");
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", toneBadge[resolved])}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />{text}</span>;
}

export function DepartmentChip({ name }: { name?: string | null }) {
  if (!name) return <span className="text-xs text-text-muted">—</span>;
  const technology = /tech/i.test(name);
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", technology ? "bg-info-light text-info" : "bg-accent-light text-[#B4612A]")}>{name}</span>;
}

export function TableCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgb(24_35_31/4%)]">
      <div className="nx-scroll-x">{children}</div>
      {footer}
    </div>
  );
}

export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return <form action={action} className="mb-5 flex flex-wrap items-end gap-2.5 rounded-[14px] border border-border bg-surface p-3 shadow-[0_1px_2px_rgb(24_35_31/4%)] [&_.input]:mt-0 [&_.input]:min-h-10 [&_.input]:py-2">{children}</form>;
}

export function Pager({ page, pages, total, href }: { page: number; pages: number; total?: number; href: (page: number) => string }) {
  if (pages <= 1) return total !== undefined ? <div className="border-t border-border px-4 py-2.5 text-xs text-text-muted">{total} record{total === 1 ? "" : "s"}</div> : null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
      <span className="text-xs text-text-muted">Page {page} of {pages}{total !== undefined ? ` · ${total} records` : ""}</span>
      <div className="flex gap-1.5">
        {page > 1 ? <Link className="button-secondary button-sm inline-flex items-center gap-1" href={href(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Link> : null}
        {page < pages ? <Link className="button-secondary button-sm inline-flex items-center gap-1" href={href(page + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Link> : null}
      </div>
    </nav>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-text-primary">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}

export function ProgressBar({ value, max, tone = "primary", label }: { value: number; max: number; tone?: "primary" | "accent" | "danger"; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (100 * value) / max)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", tone === "primary" ? "bg-primary" : tone === "accent" ? "bg-accent" : "bg-danger")} style={{ width: `${pct}%` }} />
    </div>
  );
}
