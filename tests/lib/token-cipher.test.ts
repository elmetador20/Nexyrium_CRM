import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptToken, encryptToken, TokenCipherError } from "@/lib/crypto/token-cipher";

const key = randomBytes(32).toString("base64");

describe("AES-256-GCM token cipher", () => {
  it("round-trips a refresh token without leaving it readable in the envelope", () => {
    const secret = "1//0g-refresh-token-value";
    const envelope = encryptToken(secret, "google_drive_refresh_token", key);
    expect(envelope.startsWith("v1.")).toBe(true);
    expect(envelope).not.toContain(secret);
    expect(decryptToken(envelope, "google_drive_refresh_token", key)).toBe(secret);
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptToken("same", "p", key)).not.toBe(encryptToken("same", "p", key));
  });

  it("rejects a wrong key, a different purpose, or tampering without echoing details", () => {
    const envelope = encryptToken("secret", "google_drive_refresh_token", key);
    expect(() => decryptToken(envelope, "google_drive_refresh_token", randomBytes(32).toString("base64"))).toThrow(TokenCipherError);
    expect(() => decryptToken(envelope, "other_purpose", key)).toThrow(TokenCipherError);
    const parts = envelope.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), "google_drive_refresh_token", key)).toThrow("Stored token could not be decrypted.");
  });

  it("refuses to run without a valid 32-byte key", () => {
    expect(() => encryptToken("secret", "p", undefined)).toThrow("not configured");
    expect(() => encryptToken("secret", "p", Buffer.alloc(16).toString("base64"))).toThrow("32 bytes");
  });
});
