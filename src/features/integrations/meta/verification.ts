import { timingSafeEqual, createHmac } from "node:crypto";

export function verifyMetaChallenge(input: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  configuredToken: string | null;
}): { ok: true; challenge: string } | { ok: false } {
  if (!input.configuredToken || input.mode !== "subscribe" || input.verifyToken !== input.configuredToken || !input.challenge) return { ok: false };
  return { ok: true, challenge: input.challenge };
}

export function verifyMetaSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | null;
}): boolean {
  if (!input.appSecret || !input.signatureHeader) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(input.signatureHeader.trim());
  if (!match) return false;
  const expected = createHmac("sha256", input.appSecret).update(input.rawBody, "utf8").digest();
  const provided = Buffer.from(match[1], "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
