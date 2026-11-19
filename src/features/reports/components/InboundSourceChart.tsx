import Link from "next/link";
import { ACQUISITION_LABELS, type AcquisitionSource } from "@/features/crm/leads/acquisition-source";

const colors = ["#167866", "#345dd5", "#956025", "#8751b0"];

export function InboundSourceChart({ sources, createdLeads }: {
  sources: Array<{ source: AcquisitionSource; count: number }>;
  createdLeads: number;
}) {
  const total = sources.reduce((sum, row) => sum + row.count, 0);
  let cursor = 0;
  const slices = sources.map(({ count }, index) => {
    const start = cursor;
    cursor += count / Math.max(total, 1) * 100;
    return `${colors[index]} ${start}% ${cursor}%`;
  });

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold">Inbound analytics</h2>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div
          aria-hidden="true"
          className="h-32 w-32 rounded-full"
          style={{ background: total ? `conic-gradient(${slices.join(", ")})` : "#d4d4d8" }}
        />
        <ul className="min-w-40 space-y-2 text-sm">
          {sources.map(({ source, count }, index) => (
            <li key={source} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index] }} />
              <Link className="underline" href={"/crm/leads?acquisitionSource="+encodeURIComponent(source)}>{ACQUISITION_LABELS[source]}</Link>
              <span className="ml-auto pl-4 tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </div>
      {createdLeads > total ? <p className="mt-4 text-sm text-text-muted">{createdLeads - total} unclassified leads</p> : null}
    </section>
  );
}
