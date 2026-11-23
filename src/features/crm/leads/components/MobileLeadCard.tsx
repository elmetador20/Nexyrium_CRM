import Link from "next/link";
import { DepartmentChip, StatusBadge } from "@/components/nx";
import { ContactActions } from "@/features/integrations/whatsapp/ContactActions";
import { ACQUISITION_LABELS } from "../acquisition-source";
import type { AcquisitionSource } from "../acquisition-source";
import type { Lead } from "@/db/schema";
import { formatDate } from "@/lib/format";

type CardLead = Pick<Lead,"id"|"contactName"|"phone"|"normalizedPhone"|"status"|"nextActionAt"|"nextAction"> & {acquisitionSource?: AcquisitionSource | null};

export function MobileLeadCard({lead, department, owner}: {lead:CardLead; department?:string|null; owner:string}) {
  return <li className="mobile-lead-card">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><Link className="nx-link text-base font-semibold" href={"/crm/leads/"+lead.id}>{lead.contactName}</Link>
        <p className="mt-1 text-sm tabular-nums text-text-secondary">{lead.phone || lead.normalizedPhone || "No phone number"}</p></div>
      <StatusBadge status={lead.status}/>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div><dt>Department</dt><dd><DepartmentChip name={department}/></dd></div>
      <div><dt>Assigned to</dt><dd>{owner}</dd></div>
      <div><dt>Source</dt><dd>{lead.acquisitionSource ? ACQUISITION_LABELS[lead.acquisitionSource] : "Unclassified"}</dd></div>
      <div><dt>Next follow-up</dt><dd>{lead.nextActionAt ? formatDate(lead.nextActionAt,true) : "Unscheduled"}{lead.nextAction && <span className="block">{lead.nextAction}</span>}</dd></div>
    </dl>
    <ContactActions phone={lead.normalizedPhone ?? lead.phone}/>
  </li>;
}
