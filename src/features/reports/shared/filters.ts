import type { ReportFilterInput } from "../schemas";
import type { ReportFilters } from "../types";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export function normalizeReportFilters(input: ReportFilterInput, now = new Date()): ReportFilters {
  const today = isoDate(now);
  const periodFrom = input.periodFrom ?? `${today.slice(0, 7)}-01`;
  const periodTo = input.periodTo ?? today;
  if (periodFrom > periodTo) throw new Error("periodFrom must be on or before periodTo.");
  if (input.asOfDate && input.asOfDate > today && now.getUTCFullYear() < 9999) throw new Error("asOfDate cannot be in the future.");
  return { periodFrom, periodTo, asOfDate: input.asOfDate ?? today, departmentIds: input.departmentIds ?? [], currencyCodes: input.currencyCodes ?? [] };
}

export function nextDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return isoDate(date); }
