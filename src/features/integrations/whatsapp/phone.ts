import { normalizePhone } from "@/features/lead-intake/normalization";
import { callingCodes } from "./calling-codes";

export function internationalPhone(raw?: string | null, country?: string | null) {
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw.trim())) return null;
  const phone = normalizePhone(raw, country);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  const code = callingCodes.find(prefix => phone.startsWith("+" + prefix));
  return code ? { phone, country: "+" + code, call: "tel:" + phone, chat: "https://wa.me/" + phone.slice(1) } : null;
}
