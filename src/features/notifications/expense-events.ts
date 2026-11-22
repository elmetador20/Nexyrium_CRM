import { sql } from "drizzle-orm";
import { notifications, type expenses } from "@/db/schema";
import type { AccountingTransaction } from "@/features/accounting/queries";

export async function notifyExpense(tx: AccountingTransaction, expense: typeof expenses.$inferSelect, actorId: string) {
  const review = expense.status === "submitted";
  const eligible = await tx.execute<{id: string}>(sql`
    select u.id from users u where u.is_active and u.id <> ${actorId}::uuid
      and not exists (select 1 from people_profiles pp where pp.user_id=u.id and pp.employment_status='terminated')
      and exists (select 1 from user_roles ur join roles r on r.id=ur.role_id
        where ur.user_id=u.id and (r.slug in ('owner_admin','founder') or exists
          (select 1 from role_permissions rp join permissions p on p.id=rp.permission_id
           where rp.role_id=r.id and p.slug in ('*','expenses:read'))))
      and (exists (select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id
           and r.slug in ('owner_admin','founder','finance','reviewer','read_only_auditor'))
        or case when exists (select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id
            and r.slug='department_lead') then exists (select 1 from user_departments ud where ud.user_id=u.id
            and ud.department_id=${expense.departmentId}::uuid) else u.id=${expense.ownerId}::uuid end)
      and ${review ? sql`exists (select 1 from user_roles ur join roles r on r.id=ur.role_id
        where ur.user_id=u.id and (r.slug in ('owner_admin','founder') or exists
          (select 1 from role_permissions rp join permissions p on p.id=rp.permission_id where rp.role_id=r.id
           and p.slug in ('*','expenses:approve','expenses:reject'))))`
        : sql`u.id in (${expense.ownerId}::uuid,${expense.createdByUserId}::uuid,${expense.submittedByUserId}::uuid)`}
  `);
  if (!eligible.rows.length) return;
  await tx.insert(notifications).values(eligible.rows.map(({id}) => ({
    recipientUserId: id, type: "expense." + expense.status,
    title: review ? "Expense ready for review" : "Expense " + expense.status,
    body: review ? "Open the expense to review its details and receipt." : "Open the expense to see the decision and review notes.",
    resourceType: "expense", resourceId: expense.id, metadata: {},
    dedupeKey: ["expense",expense.id,expense.status,id].join(":"),
  }))).onConflictDoNothing({ target: notifications.dedupeKey });
}
