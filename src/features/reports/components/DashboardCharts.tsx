"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Area, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { compactMinor } from "@/lib/format";

const GREEN = "#245B45";
const GREEN_2 = "#36785C";
const ORANGE = "#E88945";
const MINT = "#E5F0E7";
const PALETTE = [GREEN, ORANGE, "#2F6690", GREEN_2, "#B4612A", "#7A8B83", "#9BC5A8"];

const tooltipStyle = { borderRadius: 10, border: "1px solid #E1E9E3", boxShadow: "0 8px 24px -12px rgb(24 35 31 / 25%)", fontSize: 12 } as const;

export type TrendPoint = { month: string; label: string; revenue: number; expenses: number; net: number };

/** Monthly collections vs recorded spend in one currency (values in minor units). Clicking a month opens its payments. */
export function RevenueExpenseChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const router = useRouter();
  const open = (month?: string) => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    router.push(`/finance/payments?status=posted&currency=${currency}&from=${month}-01&to=${last}`);
  };
  return (
    <div className="h-72 w-full" role="img" aria-label={`Monthly revenue and expenses in ${currency}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(state) => open(data[Number(state?.activeTooltipIndex ?? -1)]?.month)}>
          <defs>
            <linearGradient id="nxRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.22} /><stop offset="100%" stopColor={GREEN} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="#EDF2EE" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7A72" }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#6B7A72" }} tickFormatter={(value: number) => compactMinor(value, currency)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [compactMinor(Number(value), currency), String(name)]} cursor={{ fill: MINT, opacity: 0.6 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue collected" stroke={GREEN} strokeWidth={2} fill="url(#nxRevenue)" style={{ cursor: "pointer" }} />
          <Bar dataKey="expenses" name="Expenses" fill={ORANGE} radius={[4, 4, 0, 0]} barSize={14} style={{ cursor: "pointer" }} />
          <Line type="monotone" dataKey="net" name="Net (cash)" stroke="#2F6690" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type BarDatum = { key: string; label: string; value: number; display: string; href: string };

/** Horizontal bars; each bar links to the filtered module. */
export function LinkedBarChart({ data, color = GREEN, ariaLabel }: { data: BarDatum[]; color?: string; ariaLabel: string }) {
  const router = useRouter();
  return (
    <div className="w-full" style={{ height: Math.max(140, data.length * 40 + 20) }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((row) => ({ label: row.label, value: row.value, display: row.display }))} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#EDF2EE" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#4A5A52" }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: MINT, opacity: 0.6 }} formatter={(_value, _name, item) => [String((item?.payload as { display?: string } | undefined)?.display ?? ""), "Value"]} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} fill={color} style={{ cursor: "pointer" }} onClick={(_entry, index) => { const href = data[index]?.href; if (href) router.push(href); }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a legend of links. */
export function LinkedDonut({ data, centerLabel, centerValue }: { data: BarDatum[]; centerLabel: string; centerValue: string }) {
  const router = useRouter();
  const total = data.reduce((sum, row) => sum + row.value, 0);
  // Recharts spreads entry fields onto the SVG sector, so pass only label/value and resolve links by index.
  const slices = total ? data.map((row) => ({ label: row.label, value: row.value, display: row.display })) : [{ label: "None", value: 1, display: "0" }];
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label={centerLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={total ? 2 : 0} stroke="none"
              onClick={(_entry, index) => { const href = total ? data[index]?.href : undefined; if (href) router.push(href); }} style={{ cursor: total ? "pointer" : "default" }}>
              {slices.map((_, index) => <Cell key={index} fill={total ? PALETTE[index % PALETTE.length] : "#E1E9E3"} />)}
            </Pie>
            {total ? <Tooltip contentStyle={tooltipStyle} formatter={(_value, _name, item) => [String((item?.payload as { display?: string } | undefined)?.display ?? ""), String((item?.payload as { label?: string } | undefined)?.label ?? "")]} /> : null}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><p className="text-lg font-semibold tabular-nums text-text-primary">{centerValue}</p><p className="text-[0.7rem] text-text-muted">{centerLabel}</p></div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {data.map((row, index) => (
          <li key={row.key}>
            <button type="button" onClick={() => router.push(row.href)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-hover">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} aria-hidden />
              <span className="truncate capitalize text-text-secondary">{row.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums text-text-primary">{row.display}</span>
            </button>
          </li>
        ))}
        {!data.length ? <li className="text-text-muted">No records yet.</li> : null}
      </ul>
    </div>
  );
}
