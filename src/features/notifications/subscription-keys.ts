export type SubscriptionKeys = { p256dh: string; auth: string };

export function validKeys(value: unknown): value is SubscriptionKeys {
  if (!value || typeof value !== "object") return false;
  const keys = value as Partial<SubscriptionKeys>;
  return typeof keys.p256dh === "string" && /^B[A-Za-z0-9_-]{86}$/.test(keys.p256dh)
    && typeof keys.auth === "string" && /^[A-Za-z0-9_-]{22}$/.test(keys.auth);
}
