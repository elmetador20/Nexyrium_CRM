import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { internationalPhone } from "./phone";

export const routes = [
  { number: "+918979952549", department: "Design", slug: "design", variable: "YCLOUD_DESIGN_WABA_ID" },
  { number: "+919389881109", department: "Technology", slug: "technology", variable: "YCLOUD_TECHNOLOGY_WABA_ID" },
] as const;

export function authentic(body: Buffer, header: string | null, secret: string, now = Date.now()) {
  const match = /^t=(\d{10}),\s*s=([0-9a-f]{64})$/i.exec(header ?? "");
  if (!secret || !match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const digest = createHmac("sha256", secret).update(match[1]+".").update(body).digest();
  return timingSafeEqual(digest, Buffer.from(match[2], "hex"));
}

const inbound = z.object({
  id: z.string().min(1).max(256), wabaId: z.string(), to: z.string(),
  from: z.string().nullish(), customerProfile: z.object({name:z.string().nullish()}).nullish(),
  referral: z.object({source_type:z.string().optional(), source_id:z.string().optional(), ctwa_clid:z.string().optional()}).nullish(),
});

export function mapEvent(raw: unknown, config: NodeJS.ProcessEnv) {
  const event = z.object({type:z.string(),id:z.string().min(1).max(256),whatsappInboundMessage:z.unknown().optional()}).safeParse(raw);
  if (!event.success) return {skip:"invalid"} as const;
  if (event.data.type !== "whatsapp.inbound_message.received") return {skip:"unsupported"} as const;
  const parsed = inbound.safeParse(event.data.whatsappInboundMessage);
  if (!parsed.success) return {skip:"invalid"} as const;
  const msg = parsed.data;
  const route = routes.find(r => r.number === msg.to);
  if (!route) return {skip:"unknown_receiver"} as const;
  if (!config[route.variable]) throw Error("Routing unavailable");
  if (msg.wabaId !== config[route.variable]) return {skip:"account_mismatch"} as const;
  const contact = internationalPhone(msg.from);
  if (!contact) return {skip:"missing_phone"} as const;
  const eventId = "ycloud:"+createHash("sha256").update(JSON.stringify([msg.wabaId, msg.to, msg.id])).digest("hex");
  return {route, input:{
    eventId, source:"whatsapp", contactName:msg.customerProfile?.name?.trim().slice(0,200) || "WhatsApp inquiry (name unconfirmed)",
    phone:contact.phone, phoneCountryCode:contact.country, status:"new",
    sourceDetails:"YCloud WhatsApp inquiry — "+route.department,
    acquisitionSource:msg.referral?.source_type === "ad" && (msg.referral.source_id || msg.referral.ctwa_clid) ? "meta ad" : undefined,
  }} as const;
}
