import Link from "next/link";
import { FinancialDocumentForm } from "@/features/finance/components/FinancialDocumentForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";
import { clientRepository } from "@/features/crm/clients/queries";
import { getCrmScope } from "@/features/crm/shared/types";

export const instant = false;
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) { const actor = await requirePagePermission(PERMISSIONS.INVOICES_CREATE); const { clientId } = await searchParams; const client = clientId && /^[0-9a-f-]{36}$/i.test(clientId) ? await clientRepository.findById(clientId, getCrmScope(actor)).catch(() => null) : null; return <section className="mx-auto max-w-6xl"><Link href="/finance/invoices" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to invoices</Link><div className="card mt-5 p-6"><h1 className="text-2xl font-semibold text-text-primary">New invoice</h1><p className="mt-2 text-sm text-text-secondary">Create a draft using normal currency amounts and an authorized client.</p><div className="mt-8"><FinancialDocumentForm kind="invoice" initialClient={client ? { id: client.id, name: client.name, companyName: client.companyName, email: client.email } : null} /></div></div></section>; }
