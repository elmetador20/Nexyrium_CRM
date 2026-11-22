import {sql} from "drizzle-orm";
import {db} from "@/db";

// A durable dedupe key ties each reminder to its deadline, including reschedules.
export async function runReminders(){
  await db.execute(sql`
    with due(kind,resource,id,recipient,deadline,title) as (
      select 'task.due','task',id,assignee_id,due_date::text,'Task due for completion' from tasks
        where archived_at is null and status not in ('done','canceled') and due_date <= (now() at time zone 'Asia/Kolkata')::date
      union all select 'lead.follow_up','lead',id,owner_id,next_action_at::text,'Lead follow-up due' from leads
        where archived_at is null and status not in ('won','lost') and next_action_at<=now()
      union all select 'invoice.overdue','invoice',id,owner_id,due_date::text,'Invoice payment overdue' from invoices
        where status in ('issued','partially_paid','overdue') and due_date < (now() at time zone 'Asia/Kolkata')::date
    )
    insert into notifications(recipient_user_id,type,title,body,resource_type,resource_id,dedupe_key,metadata)
    select u.id,kind,title,'Open the record to check its current status.',resource,id_key,
      concat_ws(':',kind,id_key,recipient,deadline),'{}'::jsonb from
      (select kind,resource,id as id_key,recipient,deadline,title from due) d join users u on u.id=recipient and u.is_active
    where not exists(select 1 from people_profiles p where p.user_id=u.id and p.employment_status='terminated')
    on conflict(dedupe_key) do nothing
  `);
  await db.execute(sql`
    insert into notifications(recipient_user_id,type,title,body,resource_type,dedupe_key,metadata)
    select u.id,'targets.digest','Monthly target progress',
      concat('Review ',count(distinct t.id),' current department target(s) and achieved totals.'),'target',
      concat('targets-digest:',u.id,':',(now() at time zone 'Asia/Kolkata')::date),'{}'::jsonb
    from department_targets t join users u on u.is_active and exists
      (select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id and
      (r.slug in ('owner_admin','founder') or (r.slug='department_lead' and exists
      (select 1 from user_departments ud where ud.user_id=u.id and ud.department_id=t.department_id))))
    where (now() at time zone 'Asia/Kolkata')::date between t.period_start and t.period_end
      and extract(hour from now() at time zone 'Asia/Kolkata')>=9
      and not exists(select 1 from people_profiles p where p.user_id=u.id and p.employment_status='terminated')
    group by u.id on conflict(dedupe_key) do nothing
  `);
}
