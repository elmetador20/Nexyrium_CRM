import Link from "next/link";

import { requirePageActor } from "@/lib/authorization/server";

export const instant = false;

export default async function ProfilePage() {
  const actor = await requirePageActor();

  return (
    <section className="mx-auto max-w-3xl">
      <Link href="/settings" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to settings</Link>
      <div className="card mt-5 p-6">
        <h1 className="text-2xl font-semibold text-text-primary">Your profile</h1>
        <p className="mt-2 text-sm text-text-secondary">Account information managed by your Nexyrium administrator.</p>
        <dl className="mt-6 divide-y divide-border rounded-lg border border-border">
          <Row label="Name" value={actor.name || "Not provided"} />
          <Row label="Email" value={actor.email} />
          <Row label="Roles" value={actor.roles.join(", ") || "None"} />
          <Row label="Departments" value={actor.departmentIds.length ? `${actor.departmentIds.length} assigned` : "None assigned"} />
        </dl>
        <Link href="/logout" className="button-secondary mt-6">Sign out</Link>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-3 px-4 py-3 text-sm"><dt className="font-medium text-text-secondary">{label}</dt><dd className="text-text-primary">{value}</dd></div>;
}
