export type PeopleErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT";

export class PeopleError extends Error {
  constructor(public readonly code: PeopleErrorCode, message: string) { super(message); this.name = "PeopleError"; }
}

export function peopleErrorResponse(error: unknown): Response | null {
  if (!(error instanceof PeopleError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
