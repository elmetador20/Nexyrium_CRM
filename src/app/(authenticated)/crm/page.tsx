import { redirect } from "next/navigation";

export const instant = false;

/** The CRM sections live in the sidebar; the bare /crm URL opens Leads. */
export default function CrmPage() {
  redirect("/crm/leads");
}
