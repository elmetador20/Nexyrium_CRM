import Link from "next/link";
import { ExpenseForm } from "@/features/accounting/components/ExpenseForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;
export default async function NewExpensePage() { await requirePagePermission(PERMISSIONS.EXPENSES_CREATE); return <section className="mx-auto max-w-6xl"><Link href="/expenses" className="text-sm text-text-muted hover:underline">← Back to expenses</Link><div className="mt-5 rounded-xl border bg-surface p-6"><h2 className="text-2xl font-semibold">New expense</h2><div className="mt-8"><ExpenseForm /></div></div></section>; }
