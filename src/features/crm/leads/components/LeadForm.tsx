import type { ComponentProps } from "react";
import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "../../shared/departments";
import { LeadFields } from "./LeadFields";

export async function LeadForm(props: Omit<ComponentProps<typeof LeadFields>, "departments">) {
  const actor = await requirePageActor();
  return <LeadFields {...props} departments={await workspaceDepartments(actor)}/>;
}
