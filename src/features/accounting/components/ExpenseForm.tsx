import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { ExpenseFields } from "./ExpenseFields";
export async function ExpenseForm() {
  return <ExpenseFields departments={await workspaceDepartments(await requirePageActor())}/>;
}
