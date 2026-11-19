export type StorageErrorCode =
  | "CONFIGURATION_MISSING"
  | "AUTHENTICATION_FAILED"
  | "ACCESS_DENIED"
  | "QUOTA_EXCEEDED"
  | "NOT_FOUND"
  | "UPLOAD_FAILED"
  | "DOWNLOAD_FAILED"
  | "DELETE_FAILED";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
