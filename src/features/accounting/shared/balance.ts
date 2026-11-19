import { parseMinor } from "@/features/finance/shared/money";

export function parseSignedMinor(value: string): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error("Signed minor-unit values must be integers.");
  return BigInt(value);
}

export function calculateJournalTotals(lines: Array<{ debitMinor: string; creditMinor: string }>) {
  return lines.reduce((result, line) => ({ debit: result.debit + parseMinor(line.debitMinor), credit: result.credit + parseMinor(line.creditMinor) }), { debit: BigInt(0), credit: BigInt(0) });
}

export function isBalancedJournal(lines: Array<{ debitMinor: string; creditMinor: string }>) {
  const totals = calculateJournalTotals(lines);
  return totals.debit === totals.credit;
}
