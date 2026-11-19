export type DocumentErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "STORAGE_FAILED"
  | "STORAGE_CONFIGURATION_MISSING"
  | "STORAGE_AUTHENTICATION_FAILED"
  | "STORAGE_ACCESS_DENIED"
  | "STORAGE_QUOTA_EXCEEDED"
  | "CONFLICT";

export class DocumentError extends Error {
  constructor(
    public readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export function documentErrorResponse(error: unknown): Response | null {
  if (!(error instanceof DocumentError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : error.code.startsWith("STORAGE_") ? 503 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
