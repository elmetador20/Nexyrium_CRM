export type ImportErrorCode =
  | "FILE_REQUIRED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "INVALID_WORKBOOK"
  | "MISSING_REQUIRED_HEADER"
  | "DUPLICATE_HEADER"
  | "TOO_MANY_ROWS"
  | "IMPORT_NOT_FOUND"
  | "IMPORT_NOT_READY"
  | "IMPORT_IN_PROGRESS";

export class LeadImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LeadImportError";
  }
}

export function leadImportErrorResponse(error: unknown): Response | null {
  if (!(error instanceof LeadImportError)) return null;
  const status = error.code === "IMPORT_NOT_FOUND" ? 404 : error.code === "IMPORT_IN_PROGRESS" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
