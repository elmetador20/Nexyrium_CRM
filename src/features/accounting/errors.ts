export type AccountingErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "IDEMPOTENCY_CONFLICT" | "STORAGE_UNAVAILABLE";

export class AccountingError extends Error {
  constructor(public readonly code: AccountingErrorCode, message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

export function accountingErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AccountingError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" ? 409 : error.code === "STORAGE_UNAVAILABLE" ? 503 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
