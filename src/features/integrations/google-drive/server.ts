import "server-only";

import { createConnectedDriveStorageAdapter } from "./connection";

/** Storage adapter used by documents and expense receipts (OAuth connection, drive.file scope). */
export function createConfiguredGoogleDriveStorageAdapter() {
  return createConnectedDriveStorageAdapter();
}
