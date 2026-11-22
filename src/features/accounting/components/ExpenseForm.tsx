import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { ExpenseFields } from "./ExpenseFields";
export async function ExpenseForm() {
  const actor = await requirePageActor();
  return <ExpenseFields canSubmit={can(actor, PERMISSIONS.EXPENSES_SUBMIT)} departments={await workspaceDepartments(actor)}/>;
}
