"use server";
import { validKeys, type SubscriptionKeys } from "./subscription-keys";
import { ECDH } from "node:crypto";
import {sql} from "drizzle-orm";
import {db} from "@/db";
import {requireActor} from "@/lib/authorization/server";
import {checkedEndpoint,pushConfiguration,sendWakeup} from "./push-transport";
export async function deviceKey() {
  await requireActor();
  return pushConfiguration().publicKey;
}
export async function registerDevice(value:string, keys?: SubscriptionKeys) {
  const actor=await requireActor();
  const endpoint=checkedEndpoint(value).href;
  if (keys) validateKeys(keys);
  // Signing in on a shared device must never retain the previous account binding.
  await db.transaction(async tx=>{
    await tx.execute(sql`delete from notification_push_devices where endpoint=${endpoint} and user_id<>${actor.userId}::uuid`);
    await tx.execute(sql`insert into notification_push_devices(user_id,endpoint) values(${actor.userId}::uuid,${endpoint}) on conflict(endpoint) do nothing`);
    if (keys) await tx.execute(sql`update notification_push_devices set p256dh=${keys.p256dh},auth=${keys.auth} where endpoint=${endpoint} and user_id=${actor.userId}::uuid`);
  }).catch(() => { throw Error("Device registration failed."); });
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

function validateKeys(keys: SubscriptionKeys) {
  if (!validKeys(keys)) throw Error("Invalid subscription keys.");
  try { ECDH.convertKey(Buffer.from(keys.p256dh, "base64url"), "prime256v1"); }
  catch { throw Error("Invalid subscription keys."); }
}

export async function upgradeDevice(value: string, keys: SubscriptionKeys) {
  const actor = await requireActor();
  const endpoint = checkedEndpoint(value).href;
  validateKeys(keys);
  try {
    await db.execute(sql`update notification_push_devices set p256dh=${keys.p256dh}, auth=${keys.auth}
      where endpoint=${endpoint} and user_id=${actor.userId}::uuid
      and (p256dh is distinct from ${keys.p256dh} or auth is distinct from ${keys.auth})`);
  } catch { throw Error("Could not update phone notification settings."); }
}
