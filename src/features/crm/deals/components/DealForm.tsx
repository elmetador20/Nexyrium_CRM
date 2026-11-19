import type { ComponentProps } from "react";
import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "../../shared/departments";
import { DealFields } from "./DealFields";

export async function DealForm(props: Omit<ComponentProps<typeof DealFields>, "departments">) {
  const actor = await requirePageActor();
  return <DealFields {...props} departments={await workspaceDepartments(actor)}/>;
}
