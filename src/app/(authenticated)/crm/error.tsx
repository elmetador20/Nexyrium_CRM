"use client";

export default function CrmError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-red-200 bg-danger-light p-8 text-red-900"><h2 className="font-semibold">CRM could not load</h2><p className="mt-2 text-sm">Try again. If the problem continues, contact an administrator.</p><button onClick={reset} className="mt-5 rounded-lg bg-red-900 px-4 py-2 text-sm font-medium text-white">Try again</button></div>;
}
