import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit/service";
import { createLeadIntakeService } from "@/features/lead-intake/services";
import { runLeadIntakeTransaction } from "@/features/lead-intake/queries";
import { authentic, mapEvent } from "./contracts";

const intake = createLeadIntakeService({transaction:runLeadIntakeTransaction});
const reply = (status: number) => new Response(null,{status});
const limit = 256 * 1024;
function audit(action: string, failed = false) {
  return recordAuditEvent({action:"ycloud."+action, resourceType:"whatsapp_integration", outcome:failed?"failure":"success"});
}

export async function receiveWebhook(request: Request) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret) return reply(503);
  if (Number(request.headers.get("content-length")) > limit) return reply(413);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) { await reader.cancel(); return reply(413); }
      chunks.push(chunk.value);
    }
  } catch { return reply(400); }
  const body = Buffer.concat(chunks);
  if (!authentic(body, request.headers.get("ycloud-signature"), secret)) return reply(401);
  try {
    let raw: unknown;
    try { raw = JSON.parse(body.toString("utf8")); } catch { await audit("skip.invalid"); return reply(400); }
    const result = mapEvent(raw,process.env);
    if (result.skip) { await audit("skip."+result.skip); return reply(204); }
    const [department] = await db.select({id:departments.id}).from(departments).where(eq(departments.slug,result.route.slug)).limit(1);
    if (!department) throw Error("Missing department");
    const outcome = await intake.ingestExternal({sourcePrefix:"whatsapp",ownerId:null,departmentId:department.id},result.input);
    if (outcome.replayed) await audit("duplicate");
    return reply(204);
  } catch {
    await audit("failure",true).catch(()=>{});
    return reply(503);
  }
}
