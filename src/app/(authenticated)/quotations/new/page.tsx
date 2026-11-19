import Link from "next/link";
import { FinancialDocumentForm } from "@/features/finance/components/FinancialDocumentForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;
export default async function NewQuotationPage() { await requirePagePermission(PERMISSIONS.QUOTATIONS_CREATE); return <section className="mx-auto max-w-6xl"><Link href="/quotations" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to quotations</Link><div className="card mt-5 p-6"><h1 className="text-2xl font-semibold text-text-primary">New quotation</h1><p className="mt-2 text-sm text-text-secondary">Enter prices in normal currency units; server-side calculations remain integer-based.</p><div className="mt-8"><FinancialDocumentForm kind="quotation" /></div></div></section>; }
