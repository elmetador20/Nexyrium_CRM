export type CrmErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID";

export class CrmError extends Error {
  constructor(
    public readonly code: CrmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

export function crmErrorResponse(error: unknown): Response | null {
  if (!(error instanceof CrmError)) {
    return null;
  }

  const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "FORBIDDEN" ? 403 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
