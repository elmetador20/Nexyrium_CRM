export type TargetErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT";

export class TargetError extends Error {
  constructor(public readonly code: TargetErrorCode, message: string) { super(message); this.name = "TargetError"; }
}

export function targetErrorResponse(error: unknown): Response | null {
  if (!(error instanceof TargetError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
