/** Receipt upload rules shared by the API (authoritative) and the browser (early feedback). */
export const RECEIPT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = RECEIPT_MIME_TYPES.join(",");

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);

/** Detects the real file type from its leading bytes (never trusts the filename or declared type). */
export function detectReceiptType(bytes: Uint8Array): ReceiptMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}

export type ReceiptValidation = { ok: true; mimeType: ReceiptMimeType } | { ok: false; message: string };

/** Pre-upload check on declared type and size (browser and server). */
export function checkReceiptMetadata(file: { type: string; size: number }, maxBytes = RECEIPT_MAX_BYTES): ReceiptValidation | null {
  if (file.size <= 0) return { ok: false, message: "The receipt file is empty." };
  if (file.size > maxBytes) return { ok: false, message: `Receipts must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.` };
  if (file.type && !(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "Receipts must be a PDF, JPEG, PNG or WebP file." };
  return null;
}

/** Full server-side validation including content sniffing. */
export function validateReceiptFile(file: { type: string; size: number }, body: Uint8Array, maxBytes = RECEIPT_MAX_BYTES): ReceiptValidation {
  const metadata = checkReceiptMetadata({ type: file.type, size: body.byteLength || file.size }, maxBytes);
  if (metadata) return metadata;
  const detected = detectReceiptType(body);
  if (!detected) return { ok: false, message: "The file content is not a valid PDF, JPEG, PNG or WebP image." };
  if (file.type && file.type !== detected) return { ok: false, message: "The file content does not match its file type." };
  return { ok: true, mimeType: detected };
}
