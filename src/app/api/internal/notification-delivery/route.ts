import {timingSafeEqual,createHash} from "node:crypto";
import {deliverNotifications} from "@/features/notifications/worker";
import {runReminders} from "@/features/notifications/reminders";
export async function POST(request:Request) {
  const secret=process.env.NOTIFICATION_JOB_SECRET;
  const hash=(s:string)=>createHash("sha256").update(s).digest();
  if(!secret || !timingSafeEqual(hash(request.headers.get("authorization")??""),hash("Bearer "+secret))) return new Response(null,{status:403});
  await runReminders();
  return Response.json({processed:await deliverNotifications()});
}
