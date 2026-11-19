import { InvoiceListPage } from "@/features/invoices/components/InvoiceListPage";
export const instant = false;
export default async function Invoices({searchParams}:{searchParams:Promise<{status?:string;page?:string;clientId?:string}>}) {
 const p=await searchParams;
 return <InvoiceListPage status={p.status} clientId={p.clientId} page={Math.max(1,Math.floor(Number(p.page)) || 1)}/>;
}
