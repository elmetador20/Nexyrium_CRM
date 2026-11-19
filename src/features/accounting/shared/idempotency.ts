import { createHash } from "node:crypto";

import { AccountingError } from "../errors";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}

export function hashAccountingPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function requireIdempotencyKey(value: string | null | undefined): string {
  const key = value?.trim();
  if (!key) throw new AccountingError("INVALID", "An Idempotency-Key header is required for this operation.");
  return key.slice(0, 255);
}
