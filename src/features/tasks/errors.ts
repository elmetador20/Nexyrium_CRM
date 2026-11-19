export type TaskErrorCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT";

export class TaskError extends Error {
  constructor(public readonly code: TaskErrorCode, message: string) {
    super(message);
    this.name = "TaskError";
  }
}

export function taskErrorResponse(error: unknown): Response | null {
  if (!(error instanceof TaskError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
  return Response.json({ error: error.message, code: error.code }, { status });
}
