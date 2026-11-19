"use client";

import { type ReactNode } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  className?: string;
}

export function KPICard({
  label,
  value,
  subtitle,
  trend,
  icon,
  iconBg = "bg-primary-light",
  iconColor = "text-primary",
  className = "",
}: KPICardProps) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="mt-1.5 text-3xl font-semibold text-text-primary">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-auto pt-4 flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium flex items-center gap-1",
              trend.positive !== false ? "text-success" : "text-danger"
            )}
          >
            {trend.positive !== false ? "↑" : "↓"} {Math.abs(trend.value)}%
          </span>
          <span className="text-sm text-text-muted">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}