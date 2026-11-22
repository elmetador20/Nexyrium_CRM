"use server";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {requireActor} from "@/lib/authorization/server";
import {checkedEndpoint,pushConfiguration,sendWakeup} from "./push-transport";
export async function deviceKey() {
  await requireActor();
  return pushConfiguration().publicKey;
}
export async function registerDevice(value:string) {
  const actor=await requireActor();
  const endpoint=checkedEndpoint(value).href;
  // Signing in on a shared device must never retain the previous account binding.
  await db.transaction(async tx=>{
    await tx.execute(sql`delete from notification_push_devices where endpoint=${endpoint} and user_id<>${actor.userId}::uuid`);
    await tx.execute(sql`insert into notification_push_devices(user_id,endpoint) values(${actor.userId}::uuid,${endpoint}) on conflict(endpoint) do nothing`);
  });
}
export async function deviceEnabled(endpoint:string) {
  const actor=await requireActor();
  return (await db.execute(sql`select 1 from notification_push_devices where endpoint=${endpoint} and user_id=${actor.userId}::uuid`)).rows.length>0;
}
export async function removeDevice(endpoint:string) {
  const actor=await requireActor();
  await db.execute(sql`delete from notification_push_devices where endpoint=${endpoint} and user_id=${actor.userId}::uuid`);
}
export async function testDevice(endpoint:string) {
  if (!await deviceEnabled(endpoint)) throw Error("Enable notifications on this device first.");
  const status=await sendWakeup(endpoint);
  if(status===404 || status===410) await removeDevice(endpoint);
  return status>=200 && status<300;
}
