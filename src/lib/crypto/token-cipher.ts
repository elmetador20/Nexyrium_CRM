import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for OAuth secrets stored in the database.
 * Format: "v1.<iv>.<authTag>.<ciphertext>" (base64url). The purpose string is bound as
 * additional authenticated data, so a value encrypted for one purpose cannot be replayed as another.
 */
const VERSION = "v1";
const IV_BYTES = 12;

export class TokenCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCipherError";
  }
}

function parseKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new TokenCipherError("Token encryption key is not configured.");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new TokenCipherError("Token encryption key must be 32 bytes.");
  return key;
}

export function encryptToken(plaintext: string, purpose: string, base64Key: string | undefined): string {
  if (!plaintext) throw new TokenCipherError("Nothing to encrypt.");
  const key = parseKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(envelope: string, purpose: string, base64Key: string | undefined): string {
  const key = parseKey(base64Key);
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new TokenCipherError("Unsupported token envelope.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Never echo the ciphertext or the underlying crypto error.
    throw new TokenCipherError("Stored token could not be decrypted.");
  }
}
