export type ProjectErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT";

export class ProjectError extends Error {
  constructor(public readonly code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

export function projectErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ProjectError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
