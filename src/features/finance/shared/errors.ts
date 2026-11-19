import { ZodError } from "zod";

export type FinanceErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "IDEMPOTENCY_CONFLICT";

export class FinanceError extends Error {
  constructor(public readonly code: FinanceErrorCode, message: string) {
    super(message);
    this.name = "FinanceError";
  }
}

export function financeErrorResponse(error: unknown): Response | null {
  if (!(error instanceof FinanceError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}

export function financeValidationResponse(error: unknown, message: string): Response | null {
  if (!(error instanceof ZodError)) return null;
  return Response.json({
    error: message,
    code: "INVALID_INPUT",
    fields: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  }, { status: 400 });
}
