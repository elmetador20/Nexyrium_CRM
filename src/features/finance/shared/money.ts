export type Money = {
  currency: string;
  minor: bigint;
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function currencyFractionDigits(currencyCode: string): number {
  const normalized = currencyCode.trim().toUpperCase();
  if (!CURRENCY_CODE.test(normalized)) throw new Error("Currency code must be three letters.");

  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: normalized }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new Error("Currency code is not supported.");
  }
}

export function majorToMinor(value: string | number, currencyCode: string): string {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("Amount must be a non-negative decimal.");

  const fractionDigits = currencyFractionDigits(currencyCode);
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > fractionDigits) throw new Error(`Amount supports at most ${fractionDigits} decimal places for ${currencyCode.toUpperCase()}.`);

  const minor = `${whole}${fraction.padEnd(fractionDigits, "0")}`;
  return BigInt(minor || "0").toString();
}

export function minorToMajor(value: string | bigint, currencyCode: string): string {
  const minor = parseMinor(value).toString();
  const fractionDigits = currencyFractionDigits(currencyCode);
  if (fractionDigits === 0) return minor;

  const padded = minor.padStart(fractionDigits + 1, "0");
  const splitAt = padded.length - fractionDigits;
  return `${padded.slice(0, splitAt)}.${padded.slice(splitAt)}`;
}

/** Format a minor-unit amount for people, without converting through a float. */
export function formatMoney(value: string | bigint, currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();
  const major = minorToMajor(value, normalized);
  const [whole, fraction] = major.split(".");
  const groupedWhole = new Intl.NumberFormat("en-US", { useGrouping: true }).format(BigInt(whole));
  return `${normalized} ${groupedWhole}${fraction ? `.${fraction}` : ""}`;
}

export function percentToBasisPoints(value: string | number): number {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error("Percentage must be a non-negative decimal with up to two decimal places.");
  const [whole, fraction = ""] = raw.split(".");
  const basisPoints = Number(`${whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isInteger(basisPoints) || basisPoints > 10000) throw new Error("Percentage must be between 0 and 100.");
  return basisPoints;
}

export function parseMinor(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error("Money must be a non-negative integer minor-unit string.");
  return BigInt(raw);
}

export function formatMinor(value: bigint | string): string {
  return typeof value === "bigint" ? value.toString() : parseMinor(value).toString();
}

export function addMinor(...values: Array<string | bigint>): string {
  return values.reduce<bigint>((sum, value) => sum + parseMinor(value), BigInt(0)).toString();
}

export function subtractMinor(left: string | bigint, right: string | bigint): string {
  const result = parseMinor(left) - parseMinor(right);
  if (result < BigInt(0)) throw new Error("Money result cannot be negative.");
  return result.toString();
}

export function multiplyQuantityMinor(quantity: string, unitPriceMinor: string): string {
  if (!/^\d+(?:\.\d{1,6})?$/.test(quantity)) throw new Error("Quantity must use up to six decimal places.");
  const [whole, fraction = ""] = quantity.split(".");
  const quantityMicros = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
  const result = (quantityMicros * parseMinor(unitPriceMinor) + BigInt(500_000)) / BigInt(1_000_000);
  return result.toString();
}

export function percentageMinor(amountMinor: string, basisPoints: number): string {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("Basis points must be between 0 and 10000.");
  return ((parseMinor(amountMinor) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000)).toString();
}

export function calculateLine(input: { quantity: string; unitPriceMinor: string; discountBps?: number; taxBps?: number }) {
  const grossMinor = multiplyQuantityMinor(input.quantity, input.unitPriceMinor);
  const discountMinor = percentageMinor(grossMinor, input.discountBps ?? 0);
  const taxableMinor = subtractMinor(grossMinor, discountMinor);
  const taxMinor = percentageMinor(taxableMinor, input.taxBps ?? 0);
  return { grossMinor, discountMinor, taxableMinor, taxMinor, totalMinor: addMinor(taxableMinor, taxMinor) };
}

export function calculateTotals(lines: Array<{ quantity: string; unitPriceMinor: string; discountBps?: number; taxBps?: number }>) {
  return lines.reduce(
    (totals, line) => {
      const calculated = calculateLine(line);
      return {
        subtotalMinor: addMinor(totals.subtotalMinor, calculated.grossMinor),
        discountMinor: addMinor(totals.discountMinor, calculated.discountMinor),
        taxMinor: addMinor(totals.taxMinor, calculated.taxMinor),
        totalMinor: addMinor(totals.totalMinor, calculated.totalMinor),
      };
    },
    { subtotalMinor: "0", discountMinor: "0", taxMinor: "0", totalMinor: "0" },
  );
}
