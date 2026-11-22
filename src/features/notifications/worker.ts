import {sql} from "drizzle-orm";
import {pushMessage} from "./push-message";
import {db} from "@/db";
import {sendWakeup,pushConfiguration} from "./push-transport";

export async function deliverNotifications() {
  pushConfiguration();
  let processed=0;
  const deadline=Date.now()+20000;
  while(processed<100 && Date.now()<deadline) {
    const found=await db.transaction(async tx=>{
      const [job]=(await tx.execute<{notification_id:string;device_id:string;endpoint:string;p256dh:string|null;auth:string|null;type:string;resource_id:string|null;eligible:boolean}>(sql`
        select q.notification_id,q.device_id,d.endpoint,d.p256dh,d.auth,n.type,n.resource_id,
          (u.is_active and n.read_at is null and n.recipient_user_id=d.user_id and not exists
            (select 1 from people_profiles p where p.user_id=u.id and p.employment_status='terminated')) as eligible
        from notification_push_deliveries q join notification_push_devices d on d.id=q.device_id
        join notifications n on n.id=q.notification_id join users u on u.id=d.user_id
        where q.next_attempt_at<=now() order by q.next_attempt_at limit 1 for update of q skip locked`)).rows;
      if (!job) return false;
      const key=sql`notification_id=${job.notification_id}::uuid and device_id=${job.device_id}::uuid`;
      let status=204;
      if (job.eligible) {
        try {
          const content = job.p256dh && job.auth ? {
            keys: { p256dh: job.p256dh, auth: job.auth },
            payload: JSON.stringify({
              id: job.notification_id,
              ...pushMessage(job.type),
              href: pushDestination(job.type, job.resource_id),
            }),
          } : undefined;
          status = await sendWakeup(job.endpoint, job.notification_id, content);
        } catch {
          status = 503;
        }
      }
      if(status===404 || status===410) await tx.execute(sql`delete from notification_push_devices where id=${job.device_id}::uuid`);
      else if(status>=200 && status<300) await tx.execute(sql`delete from notification_push_deliveries where ${key}`);
      else await tx.execute(sql`update notification_push_deliveries set attempts=attempts+1,
          next_attempt_at=now()+ make_interval(secs=>least(3600,30*(1<<least(attempts,7)))) where ${key}`);
      return true;
    });
    if(!found) break;
    processed++;
  }
  return processed;
}

function pushDestination(type: string, id: string | null) {
  if (type === "task.assigned" || type === "task.due") return "/tasks";
  const routes: Record<string,string> = {
    "expense.submitted": "/expenses/", "expense.approved": "/expenses/", "expense.rejected": "/expenses/",
    "lead.follow_up": "/crm/leads/", "project.member.added": "/projects/",
    "invoice.overdue": "/finance/invoices/", "quotation.submitted": "/quotations/"
  };
  return id && Object.hasOwn(routes,type) ? routes[type]+id : "/settings/notifications";
}
