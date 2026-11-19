import type { AuditEventSummary } from "../types";

export function RecentAuditEvents({ events }: { events: AuditEventSummary[] }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold">Audit trail</h2>
      <p className="mt-1 text-sm text-text-muted">Latest 50 events in the selected period · UTC</p>
      {events.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Time</th><th>Action</th><th>Record</th><th>Team member</th><th>Outcome</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td><time dateTime={event.createdAt}>{event.createdAt.slice(0, 16).replace("T", " ")}</time></td>
                  <td>{event.action}</td>
                  <td>{event.resourceType.replaceAll("_"," ")}</td>
                  <td>{event.actorName ?? (event.actorUserId ? "Former teammate" : "System")}</td>
                  <td>{event.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-text-muted">No audit events in this period.</p>}
    </section>
  );
}
