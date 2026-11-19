import { formatMoney } from "@/features/finance/shared/money";

/**
 * Money in this codebase comes in two shapes:
 * - finance tables (invoices, payments, expenses, journals) store integer MINOR units;
 * - deals store `expected_value` as a numeric MAJOR amount (e.g. "85000.00").
 * Mixing them up is what produced the earlier "INR 2,500" pipeline figure
 * (250000 major rendered as minor). Always go through these helpers.
 */
export type CurrencyAmount = { currency: string; minor: string };

/** Format a major-unit decimal string (deal values) without float rounding. */
export function formatMajor(value: string | number, currency: string) {
  const raw = String(value ?? "0").trim() || "0";
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(whole || "0"));
  const cents = fraction.replace(/0+$/, "");
  return `${negative ? "−" : ""}${currencySymbol(currency)}${grouped}${cents ? "." + cents.padEnd(2, "0").slice(0, 2) : ""}`;
}

/** Convert a major decimal string to minor units (2dp) so it can be summed exactly. */
export function majorToMinorString(value: string | number) {
  const raw = String(value ?? "0").trim() || "0";
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const minor = BigInt((whole || "0") + fraction.padEnd(2, "0").slice(0, 2));
  return (negative ? -minor : minor).toString();
}

/** Format a minor-unit amount with a currency symbol and Indian grouping for INR. */
export function formatMinor(value: string | bigint, currency: string) {
  const big = BigInt(value);
  const negative = big < BigInt(0);
  const formatted = formatMoney(negative ? -big : big, currency);
  const [, amount] = formatted.split(" ");
  const [whole, fraction] = amount.split(".");
  const grouped = currency.toUpperCase() === "INR" ? new Intl.NumberFormat("en-IN").format(BigInt(whole.replaceAll(",", ""))) : whole;
  const trimmed = fraction && /^0+$/.test(fraction) ? "" : fraction ? "." + fraction : "";
  return `${negative ? "−" : ""}${currencySymbol(currency)}${grouped}${trimmed}`;
}

/** Compact a minor amount for chart axes, e.g. ₹3.2L or $12.4K. */
export function compactMinor(value: number, currency: string) {
  const major = value / 100;
  const symbol = currencySymbol(currency);
  if (currency.toUpperCase() === "INR") {
    const abs = Math.abs(major);
    if (abs >= 1e7) return `${symbol}${(major / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${symbol}${(major / 1e5).toFixed(1)}L`;
    if (abs >= 1e3) return `${symbol}${(major / 1e3).toFixed(1)}K`;
    return `${symbol}${major.toFixed(0)}`;
  }
  return symbol + new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(major);
}

/** Sum rows per currency, never across currencies. */
export function sumByCurrency(rows: CurrencyAmount[]) {
  const totals = new Map<string, bigint>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? BigInt(0)) + BigInt(row.minor || "0"));
  return [...totals].map(([currency, minor]) => ({ currency, minor: minor.toString() }));
}

/** Render one value per currency, joined with a separator. Empty → zero in the fallback currency. */
export function formatCurrencies(rows: CurrencyAmount[], fallbackCurrency = "INR") {
  const totals = sumByCurrency(rows);
  if (!totals.length) return formatMinor("0", fallbackCurrency);
  return totals.map((row) => formatMinor(row.minor, row.currency)).join(" · ");
}

export function currencySymbol(currency: string) {
  switch (currency.toUpperCase()) {
    case "INR": return "₹";
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "AED": return "AED ";
    default: return currency.toUpperCase() + " ";
  }
}

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00Z") : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: withTime ? undefined : "UTC" }).format(date);
}
