import Link from "next/link";

export default function CrmNotFound() {
  return <div className="rounded-2xl border border-dashed border-border-strong p-12 text-center"><h2 className="font-semibold">CRM record not found</h2><p className="mt-2 text-sm text-text-muted">It may have been archived or you may not have access to it.</p><Link href="/crm" className="mt-5 inline-block text-sm underline underline-offset-4">Return to CRM</Link></div>;
}
