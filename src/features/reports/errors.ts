export type ReportsErrorCode = "FORBIDDEN" | "INVALID";

export class ReportsError extends Error {
  constructor(public readonly code: ReportsErrorCode, message: string) { super(message); this.name = "ReportsError"; }
}

export function reportsErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ReportsError)) return null;
  return Response.json({ error: error.message, code: error.code }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
}
