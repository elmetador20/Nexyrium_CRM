"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#4F46E5",
  "#159A68",
  "#D99016",
  "#DC4545",
  "#0891B2",
  "#9333EA",
  "#EC4899",
  "#F97316",
];

const CHART_COLORS_LIGHT = [
  "#EEF0FA",
  "#ECFDF3",
  "#FFFAEB",
  "#FEF3F2",
  "#E0F2FE",
  "#F5F3FF",
  "#FDF2F8",
  "#FFF7ED",
];

function formatCurrency(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return `₹${amount.toLocaleString()}`;
}

function leadSourceLabel(props: unknown) {
  const { source, percentage } = props as { source?: string; percentage?: number };
  return `${source ?? "Unknown"} ${((percentage ?? 0) * 100).toFixed(1)}%`;
}

function invoiceStatusLabel(props: unknown) {
  const { status, percentage } = props as { status?: string; percentage?: number };
  return `${status ?? "Unknown"} ${((percentage ?? 0) * 100).toFixed(1)}%`;
}

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

function ChartCard({ title, description, children, className, action }: ChartCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="h-[300px]">{children}</div>
    </Card>
  );
}

interface RevenueTrendData {
  month: string;
  revenue: number;
  target?: number;
}

export function RevenueTrendChart({ data }: { data: RevenueTrendData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Revenue Trend" description="Monthly revenue vs target">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No revenue data available for the selected period.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Revenue Trend" description="Monthly revenue vs target">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EAF0" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={{ stroke: "#E7EAF0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
            formatter={(value) => [formatCurrency(value), ""]}
            labelFormatter={(label) => label}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#4F46E5"
            fill="#EEF0FA"
            fillOpacity={0.6}
            strokeWidth={2}
          />
          {data[0].target !== undefined && (
            <Line
              type="monotone"
              dataKey="target"
              name="Target"
              stroke="#D99016"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface LeadSourceData {
  source: string;
  count: number;
  percentage: number;
}

export function LeadSourceChart({ data }: { data: LeadSourceData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Lead Sources" description="Distribution of leads by source">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No lead source data available.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Lead Sources" description="Distribution of leads by source">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="count"
            nameKey="source"
            label={leadSourceLabel}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
            formatter={(value, name) => [`${Number(value ?? 0)} leads`, String(name ?? "")]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            formatter={(value) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface PipelineStageData {
  stage: string;
  value: number;
  count: number;
  color?: string;
}

export function PipelineChart({ data }: { data: PipelineStageData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Sales Pipeline" description="Deal value by stage">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No pipeline data available.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Sales Pipeline" description="Deal value by stage">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EAF0" horizontal={false} />
          <XAxis
            type="category"
            dataKey="stage"
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={{ stroke: "#E7EAF0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
            formatter={(value) => [formatCurrency(value), ""]}
            labelFormatter={(label) => label}
          />
          <Legend />
          <Bar
            dataKey="value"
            name="Pipeline Value"
            radius={[4, 4, 0, 0]}
             barSize={40}
          >
            {data.map((item, index) => (
              <Cell key={`cell-${index}`} fill={item.color || CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface TargetVsActualData {
  department: string;
  target: number;
  actual: number;
}

export function TargetVsActualChart({ data }: { data: TargetVsActualData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Targets vs Actual" description="Department performance">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No target data available.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Targets vs Actual" description="Department performance">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EAF0" horizontal={false} />
          <XAxis
            type="category"
            dataKey="department"
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={{ stroke: "#E7EAF0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
             formatter={(value, name) => [formatCurrency(value), String(name ?? "")]}
            labelFormatter={(label) => label}
          />
          <Legend />
           <Bar dataKey="target" name="Target" fill="#E7EAF0" radius={[4, 4, 0, 0]} barSize={30} />
           <Bar dataKey="actual" name="Actual" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface InvoiceStatusData {
  status: string;
  count: number;
  amount: number;
}

export function InvoiceStatusChart({ data }: { data: InvoiceStatusData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Invoice Status" description="Invoices by status">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No invoice data available.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Invoice Status" description="Invoices by status">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="amount"
            nameKey="status"
             label={invoiceStatusLabel}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
             formatter={(value, name) => [formatCurrency(value), String(name ?? "")]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface ProjectStatusData {
  status: string;
  count: number;
}

export function ProjectStatusChart({ data }: { data: ProjectStatusData[] }) {
  if (!data || data.length === 0) {
    return (
      <ChartCard title="Project Status" description="Projects by status">
        <div className="h-[300px] flex items-center justify-center text-text-muted">
          No project data available.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Project Status" description="Projects by status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EAF0" vertical={false} />
          <XAxis
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="status"
            tick={{ fontSize: 12, fill: "#667085" }}
            axisLine={{ stroke: "#E7EAF0" }}
            tickLine={false}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E7EAF0",
              borderRadius: "8px",
              boxShadow: "0 4px 8px -2px rgb(23 32 51 / 0.08)",
            }}
             formatter={(value) => [`${Number(value ?? 0)} projects`, ""]}
          />
           <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
