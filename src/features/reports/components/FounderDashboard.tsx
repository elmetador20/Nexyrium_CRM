import Link from "next/link";
import { FilterChip } from "@/components/nx/FilterChip";
import {
  AlertTriangle, ArrowDownRight, Banknote, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDollarSign, Clock, Coins,
  FileWarning, Handshake, Layers, PiggyBank, ReceiptText, Target, TrendingUp, UserPlus, Users, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, Panel, PanelLink, ProgressBar, StatCard, StatusBadge } from "@/components/nx";
import { formatCurrencies, formatDate, formatMajor, formatMinor, humanize, majorToMinorString, sumByCurrency, type CurrencyAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "../types";
import { LinkedBarChart, LinkedDonut, RevenueExpenseChart, type BarDatum, type TrendPoint } from "./DashboardCharts";

type Department = { id: string; name: string };
export type DashboardVariant = "overview" | "finance" | "reports";

const AUDIT_LABELS: Record<string, string> = {
  "crm.lead.create": "created a lead", "crm.lead.update": "updated a lead", "crm.lead.convert": "converted a lead",
  "crm.client.create": "added a client", "crm.client.update": "updated a client", "crm.deal.create": "opened a deal", "crm.deal.update": "updated a deal",
};

function auditLabel(action: string) {
  if (AUDIT_LABELS[action]) return AUDIT_LABELS[action];
  const parts = action.split(".");
  const verb = parts.at(-1)?.replaceAll("_", " ") ?? action;
  const noun = parts.at(-2)?.replaceAll("_", " ") ?? "";
  return `${verb} ${noun}`.trim();
}

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }

function presets(today: string) {
  const now = new Date(today + "T00:00:00Z");
  const monthStart = today.slice(0, 7) + "-01";
  const d30 = new Date(now); d30.setUTCDate(d30.getUTCDate() - 29);
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const quarterStart = isoDay(new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1)));
  // Indian financial year starts 1 April.
  const fyYear = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return [
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "30d", label: "Last 30 days", from: isoDay(d30), to: today },
    { key: "quarter", label: "This quarter", from: quarterStart, to: today },
    { key: "fy", label: "Financial year", from: `${fyYear}-04-01`, to: today },
    { key: "all", label: "All time", from: "2000-01-01", to: today },
  ];
}

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-[0.95rem] font-semibold text-text-primary">{title}</h2>{description ? <p className="text-xs text-text-muted">{description}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListRow({ href, title, meta, value, badge }: { href: string; title: ReactNode; meta?: ReactNode; value?: ReactNode; badge?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{title}</span>{meta ? <span className="block truncate text-xs text-text-muted">{meta}</span> : null}</span>
        {badge}
        {value ? <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">{value}</span> : null}
      </Link>
    </li>
  );
}

function EmptyLine({ children }: { children: ReactNode }) { return <p className="px-2 py-6 text-center text-sm text-text-muted">{children}</p>; }

export function FounderDashboard({ data, departments, variant = "overview", userName, extra }: { data: DashboardMetrics; departments: Department[]; variant?: DashboardVariant; userName?: string | null; extra?: ReactNode }) {
  const { leads, deals, finance, delivery, targets, filters } = data;
  const base = variant === "overview" ? "/dashboard" : variant === "finance" ? "/finance" : "/reports";
  const today = new Date().toISOString().slice(0, 10);
  const departmentId = filters.departmentIds.length === 1 ? filters.departmentIds[0] : undefined;
  const departmentName = departments.find((d) => d.id === departmentId)?.name;
  const period = new URLSearchParams({ from: filters.periodFrom, to: filters.periodTo, ...(departmentId ? { departmentId } : {}) }).toString();
  const selfLink = (changes: Record<string, string | undefined>) => {
    const query = new URLSearchParams({ periodFrom: filters.periodFrom, periodTo: filters.periodTo, ...(departmentId ? { departmentIds: departmentId } : {}) });
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    return `${base}?${query}`;
  };
  const presetList = presets(today);
  const activePreset = presetList.find((p) => p.from === filters.periodFrom && p.to === filters.periodTo)?.key;

  // ---------- finance ----------
  const collected: CurrencyAmount[] = (finance.paymentsReceived ?? []).map((r) => ({ currency: r.currency, minor: r.totalMinor }));
  const spent: CurrencyAmount[] = (data.expenses ?? []).map((r) => ({ currency: r.currency, minor: r.amount }));
  const cashNet = sumByCurrency([...collected, ...spent.map((r) => ({ ...r, minor: (-BigInt(r.minor)).toString() }))]);
  const ledgerRows = (data.profit ?? []).filter((r) => !departmentId || r.departmentId === departmentId);
  const hasLedger = ledgerRows.length > 0;
  const ledgerNet = sumByCurrency(ledgerRows.map((r) => ({ currency: r.currency, minor: r.amount })));
  const receivables = (finance.receivables ?? []).map((r) => ({ currency: r.currency, minor: r.outstandingMinor }));
  const overdue = (finance.overdueReceivables ?? []).map((r) => ({ currency: r.currency, minor: r.outstandingMinor }));
  const currencies = new Set([...collected, ...spent, ...receivables].map((r) => r.currency));
  const primaryCurrency = currencies.has("INR") || !currencies.size ? "INR" : [...currencies][0];

  // ---------- trend ----------
  const trendMonths = data.trend?.months ?? [];
  const trend: TrendPoint[] = trendMonths.map((month) => {
    const revenue = Number(data.trend?.credits?.find((r) => r.month === month && r.currency === primaryCurrency)?.amount ?? 0);
    const expenses = Number(data.trend?.spend?.find((r) => r.month === month && r.currency === primaryCurrency)?.amount ?? 0);
    const [y, m] = month.split("-").map(Number);
    return { month, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }) + " " + String(y).slice(2), revenue, expenses, net: revenue - expenses };
  });
  const thisMonth = today.slice(0, 7);
  const monthRevenue = (data.trend?.credits ?? []).filter((r) => r.month === thisMonth).map((r) => ({ currency: r.currency, minor: r.amount }));
  const monthSpend = (data.trend?.spend ?? []).filter((r) => r.month === thisMonth).map((r) => ({ currency: r.currency, minor: r.amount }));
  const otherCurrencies = [...new Set([...(data.trend?.credits ?? []), ...(data.trend?.spend ?? [])].map((r) => r.currency))].filter((c) => c !== primaryCurrency);

  // ---------- pipeline ----------
  const pipeline = deals.pipelineByStage ?? [];
  const pipelineTotals = sumByCurrency(pipeline.map((r) => ({ currency: r.currency, minor: majorToMinorString(r.total) })));
  const wonTotals = sumByCurrency((deals.closedWon ?? []).map((r) => ({ currency: r.currency, minor: majorToMinorString(r.total) })));
  const stageOrder = ["prospecting", "qualified", "proposal", "negotiation"];
  const stageData: BarDatum[] = stageOrder.map((stage) => {
    const rows = pipeline.filter((r) => r.stage === stage);
    const minor = sumByCurrency(rows.map((r) => ({ currency: r.currency, minor: majorToMinorString(r.total) })));
    const count = rows.reduce((s, r) => s + r.count, 0);
    return { key: stage, label: humanize(stage), value: Number(minor.find((r) => r.currency === primaryCurrency)?.minor ?? 0) / 100, display: `${count} · ${minor.length ? minor.map((r) => formatMinor(r.minor, r.currency)).join(" · ") : formatMinor("0", primaryCurrency)}`, href: `/crm/pipeline#${stage}` };
  });

  // ---------- leads ----------
  const funnel = leads.funnel ?? {};
  const totalLeads = Object.values(funnel).reduce((s, n) => s + n, 0);
  const newLeads = leads.createdLeads ?? 0;
  const convertedCohort = (leads.sourcePerformance ?? []).reduce((s, r) => s + r.convertedCohort, 0);
  const conversion = newLeads ? `${((100 * convertedCohort) / newLeads).toFixed(1)}%` : "—";
  const leadStatusData: BarDatum[] = ["new", "contacted", "qualified", "proposal", "won", "lost"].filter((s) => funnel[s] !== undefined).map((s) => ({ key: s, label: humanize(s), value: funnel[s] ?? 0, display: String(funnel[s] ?? 0), href: `/crm/leads?status=${s}` }));
  const sourceData: BarDatum[] = (leads.inboundSources ?? []).map((r) => ({ key: r.source, label: r.source, value: r.count, display: String(r.count), href: `/crm/leads?acquisitionSource=${encodeURIComponent(r.source)}` }));
  const invoiceStatusData: BarDatum[] = (finance.statuses ?? []).map((r) => ({ key: r.status, label: humanize(r.status), value: r.count, display: String(r.count), href: `/finance/invoices?status=${r.status}` }));

  // ---------- departments ----------
  const perf = data.departmentPerformance;
  const departmentCards = perf ? [...departments, ...(perf.cash.some((r) => r.id === null) || perf.spend.some((r) => r.id === null) || perf.pipeline.some((r) => r.id === null) ? [{ id: null as string | null, name: "Unassigned" }] : [])]
    .filter((d) => !departmentId || d.id === departmentId)
    .map((d) => {
      const revenue = perf.cash.filter((r) => r.id === d.id).map((r) => ({ currency: r.currency, minor: r.value }));
      const expenses = perf.spend.filter((r) => r.id === d.id).map((r) => ({ currency: r.currency, minor: r.value }));
      const profit = sumByCurrency([...revenue, ...expenses.map((r) => ({ ...r, minor: (-BigInt(r.minor)).toString() }))]);
      const pipe = sumByCurrency(perf.pipeline.filter((r) => r.id === d.id).map((r) => ({ currency: r.currency, minor: majorToMinorString(r.value) })));
      const clients = perf.customers.find((r) => r.id === d.id)?.value ?? 0;
      return { ...d, revenue, expenses, profit, pipe, clients };
    }) : [];

  const ops = data.operations;
  const greeting = (() => { const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" })); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; })();
  const firstName = userName?.split(" ")[0];
  const title = variant === "finance" ? "Revenue & finance" : variant === "reports" ? "Reports" : `${greeting}${firstName ? ", " + firstName : ""}`;
  const subtitle = variant === "overview" ? "Your entire business in one place — finance, pipeline, clients and operations." : variant === "finance" ? "Collections, receivables, spend and profitability." : "Detailed operational and financial reporting.";

  const financialCards = finance.available || data.expenses ? [
    finance.available && { label: "Revenue collected", value: formatCurrencies(collected, primaryCurrency), hint: `${(finance.paymentsReceived ?? []).reduce((s, r) => s + r.count, 0)} posted payments`, href: `/finance/payments?status=posted&${period}`, icon: <Banknote className="h-4 w-4" />, tone: "primary" as const },
    data.expenses && { label: "Total expenses", value: formatCurrencies(spent, primaryCurrency), hint: "Submitted & approved", href: `/expenses?${period}`, icon: <ReceiptText className="h-4 w-4" />, tone: "accent" as const },
    finance.available && data.expenses && { label: "Net profit", value: hasLedger ? formatCurrencies(ledgerNet, primaryCurrency) : formatCurrencies(cashNet, primaryCurrency), hint: hasLedger ? "Posted ledger revenue − expense" : "Cash basis: collected − expenses", href: hasLedger ? "/reports#ledger-summary" : "/finance", icon: <PiggyBank className="h-4 w-4" />, tone: "success" as const },
    finance.available && { label: "Outstanding receivables", value: formatCurrencies(receivables, primaryCurrency), hint: "Issued invoices less posted allocations", href: "/finance/invoices?status=outstanding", icon: <CircleDollarSign className="h-4 w-4" />, tone: "info" as const },
    finance.available && { label: "Pending payments", value: String(finance.unpaidCount ?? 0), hint: "Invoices awaiting payment", href: "/finance/invoices?status=outstanding", icon: <Clock className="h-4 w-4" />, tone: "warning" as const },
    finance.available && { label: "Overdue invoices", value: String(finance.overdueCount ?? 0), hint: formatCurrencies(overdue, primaryCurrency) + " past due", href: "/finance/invoices?status=overdue", icon: <FileWarning className="h-4 w-4" />, tone: (finance.overdueCount ? "danger" : "neutral") as "danger" | "neutral" },
    finance.available && { label: "Revenue this month", value: formatCurrencies(monthRevenue, primaryCurrency), hint: new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }), href: `/finance/payments?status=posted&from=${thisMonth}-01&to=${today}`, icon: <TrendingUp className="h-4 w-4" />, tone: "primary" as const },
    data.expenses && { label: "Expenses this month", value: formatCurrencies(monthSpend, primaryCurrency), hint: new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }), href: `/expenses?from=${thisMonth}-01&to=${today}`, icon: <ArrowDownRight className="h-4 w-4" />, tone: "accent" as const },
  ].filter(Boolean) as Array<Parameters<typeof StatCard>[0]> : [];

  const businessCards = [
    leads.available && { label: "Total leads", value: String(totalLeads), hint: "Open records, all time", href: "/crm/leads", icon: <Users className="h-4 w-4" />, tone: "info" as const },
    leads.available && { label: "New leads", value: String(newLeads), hint: "Created in period", href: "/crm/leads?status=new", icon: <UserPlus className="h-4 w-4" />, tone: "primary" as const },
    data.allClientCount !== undefined && { label: "Total clients", value: String(data.allClientCount), hint: "Including archived", href: "/crm/clients", icon: <Layers className="h-4 w-4" />, tone: "neutral" as const },
    data.clientCount !== undefined && { label: "Active clients", value: String(data.clientCount), hint: "Not archived", href: "/crm/clients", icon: <CheckCircle2 className="h-4 w-4" />, tone: "success" as const },
    deals.available && { label: "Active pipeline", value: pipelineTotals.length ? pipelineTotals.map((r) => formatMinor(r.minor, r.currency)).join(" · ") : formatMinor("0", primaryCurrency), hint: `${deals.openDealCount ?? 0} open deals · excludes won & lost`, href: "/crm/pipeline", icon: <BriefcaseBusiness className="h-4 w-4" />, tone: "primary" as const },
    deals.available && { label: "Closed-won deals", value: String(deals.wonCount ?? 0), hint: (wonTotals.length ? wonTotals.map((r) => formatMinor(r.minor, r.currency)).join(" · ") : formatMinor("0", primaryCurrency)) + " contracted", href: "/crm/deals?stage=won", icon: <Handshake className="h-4 w-4" />, tone: "success" as const },
    deals.available && { label: "Lost deals", value: String(deals.lostCount ?? 0), hint: "All time", href: "/crm/deals?stage=lost", icon: <XCircle className="h-4 w-4" />, tone: "danger" as const },
    leads.available && { label: "Conversion rate", value: conversion, hint: `${convertedCohort} of ${newLeads} new leads converted`, href: "/reports#lead-conversion", icon: <Target className="h-4 w-4" />, tone: "accent" as const },
  ].filter(Boolean) as Array<Parameters<typeof StatCard>[0]>;

  return (
    <div className="space-y-8">
      {/* Hero + filters */}
      <div className="nx-hero p-4 sm:p-6 nx-fade-up">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{variant === "overview" ? "Founder command center" : "NEXYRIUM"}{departmentName ? ` · ${departmentName}` : ""}</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
            <p className="mt-2 text-xs text-text-muted">{formatDate(filters.periodFrom)} – {formatDate(filters.periodTo)} · UTC · amounts are never combined across currencies</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.actions?.payment ? <Link className="button-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm sm:py-2" href="/finance/invoices#record-payment"><Coins className="h-4 w-4" aria-hidden />Record payment</Link> : null}
            {data.actions?.invoice ? <Link className="button-secondary px-3 py-1.5 text-sm sm:py-2" href="/finance/invoices/new">New invoice</Link> : null}
            {data.actions?.expense ? <Link className="button-secondary px-3 py-1.5 text-sm sm:py-2" href="/expenses/new">Add expense</Link> : null}
          </div>
        </div>
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
          <div className="nx-chip-row flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface/80 p-1 sm:flex-wrap" role="group" aria-label="Period">
            {presetList.map((p) => (
              <FilterChip key={p.key} href={selfLink({ periodFrom: p.from, periodTo: p.to })} active={activePreset === p.key}>{p.label}</FilterChip>
            ))}
          </div>
          {departments.length ? (
            <div className="nx-chip-row flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface/80 p-1 sm:flex-wrap" role="group" aria-label="Department">
              {[{ id: "", name: "All departments" }, ...departments].map((d) => (
                <FilterChip key={d.id || "all"} href={selfLink({ departmentIds: d.id || undefined })} active={(departmentId ?? "") === d.id}>{d.name}</FilterChip>
              ))}
            </div>
          ) : null}
          <form action={base} className="grid w-full grid-cols-2 items-center gap-1.5 text-xs sm:flex sm:w-auto">
            {departmentId ? <input type="hidden" name="departmentIds" value={departmentId} /> : null}
            <label className="sr-only" htmlFor="periodFrom">From</label>
            <input id="periodFrom" name="periodFrom" type="date" defaultValue={filters.periodFrom} required className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-2 text-xs sm:h-8 sm:w-auto" />
            <span className="hidden text-text-muted sm:inline">to</span>
            <label className="sr-only" htmlFor="periodTo">Through</label>
            <input id="periodTo" name="periodTo" type="date" defaultValue={filters.periodTo} required className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-2 text-xs sm:h-8 sm:w-auto" />
            <button className="col-span-2 h-9 rounded-lg border border-border bg-surface px-2.5 font-medium text-text-secondary hover:text-primary sm:h-8">Apply dates</button>
          </form>
        </div>
      </div>

      {extra}

      {financialCards.length ? (
        <Section title="Financial health" description="Collections use posted payments only; refunds and reversals are excluded.">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">{financialCards.map((card) => <StatCard key={card.label} {...card} />)}</div>
        </Section>
      ) : null}

      {variant !== "finance" && businessCards.length ? (
        <Section title="Business momentum">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">{businessCards.map((card) => <StatCard key={card.label} {...card} />)}</div>
        </Section>
      ) : null}

      {(finance.available || data.expenses) && trend.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="Revenue vs expenses" description={`Last 12 months · ${primaryCurrency}${otherCurrencies.length ? ` · other currencies (${otherCurrencies.join(", ")}) shown separately in Finance` : ""} · click a month for its payments`} action={<PanelLink href="/finance">Revenue</PanelLink>}>
            {trend.some((p) => p.revenue || p.expenses) ? <RevenueExpenseChart data={trend} currency={primaryCurrency} /> : <EmptyState title="No collections or spend yet" description="Posted payments and submitted expenses will chart here." />}
          </Panel>
          <Panel title="Invoice status" description="All invoices in scope" action={<PanelLink href="/finance/invoices">Invoices</PanelLink>}>
            <LinkedDonut data={invoiceStatusData} centerLabel="invoices" centerValue={String(invoiceStatusData.reduce((s, r) => s + r.value, 0))} />
          </Panel>
        </div>
      ) : null}

      {departmentCards.length ? (
        <Section title="Departments" description="Revenue is posted collections; profit is cash basis (collections − recorded expenses); pipeline excludes won and lost deals.">
          <div className="grid gap-3 md:grid-cols-2">
            {departmentCards.map((d) => (
              <Link key={d.id ?? "none"} href={d.id ? selfLink({ departmentIds: d.id }) : base} className="nx-card-interactive block rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(24_35_31/4%)]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-semibold text-text-primary"><span className={cn("h-2.5 w-2.5 rounded-full", /tech/i.test(d.name) ? "bg-info" : d.id ? "bg-accent" : "bg-border-strong")} aria-hidden />{d.name}</h3>
                  <span className="text-xs text-text-muted">{d.clients} active client{d.clients === 1 ? "" : "s"}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {[["Revenue", formatCurrencies(d.revenue, primaryCurrency)], ["Expenses", formatCurrencies(d.expenses, primaryCurrency)], ["Profit", formatCurrencies(d.profit, primaryCurrency)], ["Pipeline", d.pipe.length ? d.pipe.map((r) => formatMinor(r.minor, r.currency)).join(" · ") : formatMinor("0", primaryCurrency)]].map(([k, v]) => (
                    <div key={k}><dt className="text-[0.7rem] font-medium uppercase tracking-wide text-text-muted">{k}</dt><dd className={cn("mt-0.5 text-sm font-semibold tabular-nums", k === "Profit" && v.startsWith("−") ? "text-danger" : "text-text-primary")}>{v}</dd></div>
                  ))}
                </dl>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {variant !== "finance" && (deals.available || leads.available) ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {deals.available ? (
            <Panel title="Pipeline by stage" description={`${primaryCurrency} value · click a stage`} action={<PanelLink href="/crm/pipeline">Pipeline</PanelLink>}>
              {stageData.some((s) => s.value) ? <LinkedBarChart data={stageData} ariaLabel="Open pipeline by stage" /> : <EmptyLine>No open deals.</EmptyLine>}
            </Panel>
          ) : null}
          {leads.available ? (
            <Panel title="Lead status" description="Current, all open leads" action={<PanelLink href="/crm/leads">Leads</PanelLink>}>
              {leadStatusData.length ? <LinkedBarChart data={leadStatusData} color="#36785C" ariaLabel="Leads by status" /> : <EmptyLine>No leads yet.</EmptyLine>}
            </Panel>
          ) : null}
          {leads.available ? (
            <Panel title="Lead sources" description="Leads created in period">
              <LinkedDonut data={sourceData.filter((s) => s.value > 0)} centerLabel="new leads" centerValue={String(newLeads)} />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* Operations */}
      <Section title="Operations" description="What needs attention next.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {delivery.available ? (
            <Panel title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" aria-hidden />Overdue tasks <span className="text-text-muted">· {delivery.overdueTasks ?? 0}</span></span>} action={<PanelLink href="/tasks">Tasks</PanelLink>} bodyClassName="p-2">
              {delivery.overdueTaskList?.length ? <ul>{delivery.overdueTaskList.map((t) => <ListRow key={t.id} href={`/projects/${t.projectId}`} title={t.title} meta={`${t.projectName} · due ${formatDate(t.due)}`} badge={<StatusBadge status={t.priority} />} />)}</ul> : <EmptyLine>Nothing overdue.</EmptyLine>}
            </Panel>
          ) : null}
          {delivery.available ? (
            <Panel title="Pending tasks" action={<PanelLink href="/tasks">Tasks</PanelLink>} bodyClassName="p-2">
              {delivery.pendingTasks?.length ? <ul>{delivery.pendingTasks.slice(0, 6).map((t) => <ListRow key={t.id} href={`/projects/${t.projectId}`} title={t.title} meta={t.due ? `Due ${formatDate(t.due)}` : "No due date"} badge={<StatusBadge status={t.status} />} />)}</ul> : <EmptyLine>No pending tasks.</EmptyLine>}
            </Panel>
          ) : null}
          {ops?.followups ? (
            <Panel title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-accent" aria-hidden />Upcoming follow-ups</span>} action={<PanelLink href="/crm/leads">Leads</PanelLink>} bodyClassName="p-2">
              {ops.followups.length ? <ul>{ops.followups.map((f) => <ListRow key={f.id} href={`/crm/leads/${f.id}`} title={f.name} meta={f.detail || "Follow up"} value={<span className="text-xs text-text-secondary">{formatDate(f.due, true)}</span>} />)}</ul> : <EmptyLine>No scheduled follow-ups.</EmptyLine>}
            </Panel>
          ) : null}
          {ops?.recentPayments ? (
            <Panel title="Recent payments" action={<PanelLink href="/finance/payments">Payments</PanelLink>} bodyClassName="p-2">
              {ops.recentPayments.length ? <ul>{ops.recentPayments.map((p) => <ListRow key={p.id} href={`/crm/clients/${p.clientId}`} title={p.name} meta={formatDate(p.date)} value={formatMinor(p.amount, p.currency)} />)}</ul> : <EmptyLine>No payments in this period.</EmptyLine>}
            </Panel>
          ) : null}
          {ops?.recentExpenses ? (
            <Panel title="Recent expenses" action={<PanelLink href="/expenses">Expenses</PanelLink>} bodyClassName="p-2">
              {ops.recentExpenses.length ? <ul>{ops.recentExpenses.map((e) => <ListRow key={e.id} href={`/expenses/${e.id}`} title={e.name} meta={`${e.category} · ${formatDate(e.date)}`} badge={<StatusBadge status={e.status} />} value={formatMinor(e.amount, e.currency)} />)}</ul> : <EmptyLine>No expenses in this period.</EmptyLine>}
            </Panel>
          ) : null}
          {ops?.topClients ? (
            <Panel title="Top clients" description="By collections in period" action={<PanelLink href="/crm/clients">Clients</PanelLink>} bodyClassName="p-2">
              {ops.topClients.length ? <ul>{ops.topClients.slice(0, 6).map((c, i) => <ListRow key={c.id + c.currency} href={`/crm/clients/${c.id}`} title={<span><span className="mr-2 text-text-muted">{i + 1}</span>{c.name}</span>} value={formatMinor(c.amount, c.currency)} />)}</ul> : <EmptyLine>No collections in this period.</EmptyLine>}
            </Panel>
          ) : null}
          {ops?.latestDeals ? (
            <Panel title="Latest deals" description="Created in period" action={<PanelLink href="/crm/deals">Deals</PanelLink>} bodyClassName="p-2">
              {ops.latestDeals.length ? <ul>{ops.latestDeals.map((d) => <ListRow key={d.id} href={`/crm/deals/${d.id}`} title={d.name} meta={formatDate(d.createdAt)} badge={<StatusBadge status={d.stage} />} value={formatMajor(d.value, d.currency)} />)}</ul> : <EmptyLine>No new deals in this period.</EmptyLine>}
            </Panel>
          ) : null}
          {data.auditEvents ? (
            <Panel title="Recent activity" action={<PanelLink href="/activities">Activities</PanelLink>} bodyClassName="p-2" className="md:col-span-2 xl:col-span-2">
              {data.auditEvents.length ? <ul className="divide-y divide-border">{data.auditEvents.slice(0, 7).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-light text-[0.7rem] font-semibold text-primary" aria-hidden>{(e.actorName ?? "S").slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium text-text-primary">{e.actorName ?? (e.actorUserId ? "Former teammate" : "System")}</span> <span className="text-text-secondary">{auditLabel(e.action)}</span></span>
                  {e.outcome !== "success" ? <StatusBadge status={e.outcome} /> : null}
                  <time className="shrink-0 text-xs text-text-muted" dateTime={e.createdAt}>{formatDate(e.createdAt, true)}</time>
                </li>
              ))}</ul> : <EmptyLine>No activity in this period.</EmptyLine>}
            </Panel>
          ) : null}
        </div>
      </Section>

      {targets.available && targets.items?.length ? (
        <Section title={`Monthly targets · ${filters.periodFrom.slice(0, 7)}`} action={<PanelLink href="/targets">Targets</PanelLink>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {targets.items.map((row) => {
              const actual = row.actualMinor ?? row.actualCount;
              const target = row.targetMinor ?? row.targetCount ?? 0;
              const fmt = (n: string | number) => (row.currencyCode ? formatMinor(String(n), row.currencyCode) : String(n));
              return (
                <div key={row.id} className="rounded-[14px] border border-border bg-surface p-4">
                  <p className="text-xs font-medium text-text-muted">{row.departmentName}</p>
                  <p className="text-sm font-semibold text-text-primary">{humanize(row.metricKey.replace(/_minor$/, ""))}</p>
                  <p className="mt-2 text-sm tabular-nums text-text-secondary">{actual == null ? "Actual unavailable" : fmt(actual)} <span className="text-text-muted">/ {fmt(target)}</span></p>
                  {actual != null ? <div className="mt-2"><ProgressBar value={Number(actual)} max={Number(target) || 1} tone={Number(actual) >= Number(target) ? "primary" : "accent"} label={`${row.departmentName} target progress`} /></div> : null}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
