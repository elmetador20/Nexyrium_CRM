export type StorageProvider = "google_drive";

export type StorageUploadInput = {
  category?: import("@/features/integrations/google-drive/categories").DriveCategory;
  operationKey?: string;
  filename: string;
  mimeType: string;
  body: Buffer;
};

export type StorageObject = {
  provider: StorageProvider;
  objectId: string;
  parentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  revision: string | null;
  etag: string | null;
  metadata: Record<string, unknown>;
};

export type StorageDownload = {
  mimeType: string;
  filename: string;
  sizeBytes: number;
  body: Buffer;
};

export type StorageAdapter = {
  provider: StorageProvider;
  verifyDestination?(category: "invoice" | "quotation", objectId: string, md5: string): Promise<boolean>;
  upload(input: StorageUploadInput): Promise<StorageObject>;
  getMetadata(objectId: string): Promise<StorageObject>;
  download(objectId: string): Promise<StorageDownload>;
  delete(objectId: string): Promise<void>;
};
