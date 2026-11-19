export function firstTouchLeadSourceMetrics(input: { leads: Array<{ id: string; status: string; createdAt: string; convertedAt: string | null }>; histories: Array<{ leadId: string; source: string; recordedAt: string; id: string }>; periodFrom: string; periodTo: string; asOfDate: string }) {
  const start = `${input.periodFrom}T00:00:00.000Z`;
  const end = `${input.periodTo}T23:59:59.999Z`;
  const asOf = `${input.asOfDate}T23:59:59.999Z`;
  const cohort = input.leads.filter((lead) => lead.createdAt >= start && lead.createdAt <= end);
  const histories = [...input.histories].sort((left, right) => `${left.leadId}:${left.recordedAt}:${left.id}`.localeCompare(`${right.leadId}:${right.recordedAt}:${right.id}`));
  const firstSources = new Map<string, string>();
  for (const history of histories) if (!firstSources.has(history.leadId)) firstSources.set(history.leadId, history.source);
  const grouped = new Map<string, { createdLeads: number; qualifiedSnapshot: number; convertedCohort: number }>();
  for (const lead of cohort) {
    const source = firstSources.get(lead.id) ?? "unknown";
    const row = grouped.get(source) ?? { createdLeads: 0, qualifiedSnapshot: 0, convertedCohort: 0 };
    row.createdLeads += 1;
    if (lead.status === "qualified") row.qualifiedSnapshot += 1;
    if (lead.convertedAt && lead.convertedAt <= asOf) row.convertedCohort += 1;
    grouped.set(source, row);
  }
  return [...grouped.entries()].map(([source, values]) => ({ source, ...values, conversionRate: values.createdLeads ? Number((values.convertedCohort / values.createdLeads).toFixed(4)) : 0 })).sort((left, right) => right.createdLeads - left.createdLeads);
}

export function calculateReceivables(input: { invoices: Array<{ id: string; currency: string; totalMinor: string; dueDate: string | null; issued: boolean; voided: boolean }>; payments: Array<{ id: string; status: string }>; allocations: Array<{ paymentId: string; invoiceId: string; amountMinor: string }>; asOfDate: string }) {
  const validPayments = new Set(input.payments.filter((payment) => payment.status === "posted").map((payment) => payment.id));
  const paid = new Map<string, bigint>();
  for (const allocation of input.allocations) if (validPayments.has(allocation.paymentId)) paid.set(allocation.invoiceId, (paid.get(allocation.invoiceId) ?? BigInt(0)) + BigInt(allocation.amountMinor));
  const result = new Map<string, bigint>();
  const overdue = new Map<string, bigint>();
  for (const invoice of input.invoices) {
    if (!invoice.issued || invoice.voided) continue;
    const outstanding = BigInt(invoice.totalMinor) - (paid.get(invoice.id) ?? BigInt(0));
    const value = outstanding > BigInt(0) ? outstanding : BigInt(0);
    result.set(invoice.currency, (result.get(invoice.currency) ?? BigInt(0)) + value);
    if (invoice.dueDate && invoice.dueDate < input.asOfDate && value > BigInt(0)) overdue.set(invoice.currency, (overdue.get(invoice.currency) ?? BigInt(0)) + value);
  }
  return { receivables: Object.fromEntries([...result.entries()].map(([currency, value]) => [currency, value.toString()])), overdue: Object.fromEntries([...overdue.entries()].map(([currency, value]) => [currency, value.toString()])) };
}
