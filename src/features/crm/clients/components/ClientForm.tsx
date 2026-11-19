import type { ComponentProps } from "react";
import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "../../shared/departments";
import { ClientFields } from "./ClientFields";

export async function ClientForm(props: Omit<ComponentProps<typeof ClientFields>, "departments">) {
  const actor = await requirePageActor();
  return <ClientFields {...props} departments={await workspaceDepartments(actor)}/>;
}
