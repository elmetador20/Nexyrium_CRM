import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { reserveUpload } from "@/features/integrations/google-drive/upload-operations";
import { createGoogleDriveStorageAdapter } from "@/features/integrations/google-drive/adapter";

const reservations = vi.hoisted(() => new Map<string, { fileId: string; folderId: string }>());
vi.mock("@/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [...reservations.values()] }) }) }),
  insert: () => ({ values: (row: { operationKey: string; folderId: string; fileId: string }) => ({
    onConflictDoNothing: async () => { if (!reservations.has(row.operationKey)) reservations.set(row.operationKey, row); },
  }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
} }));

it("recovers an accepted upload after a lost response and concurrent retries", async () => {
  const files = new Set<string>();
  let counter = 0;
  const body = Buffer.from("synthetic");
  const drive = { files: {
    generateIds: async () => ({ data: { ids: [String(++counter)] } }),
    create: async ({ requestBody }: { requestBody: {id: string} }) => {
      if (files.has(requestBody.id)) throw { response: { status: 409 } };
      files.add(requestBody.id);
      throw new Error("response lost");
    },
    get: async ({fileId}: {fileId: string}) => ({ data: { id: fileId, parents: ["child"], md5Checksum: createHash("md5").update(body).digest("hex") } }),
  } };
  const adapter = createGoogleDriveStorageAdapter({ resolve: async () => ({
    drive: drive as never, folderId: "child", reservation: await reserveUpload("conn", "document", "same-key", "child", drive as never),
  }) });
  const send = () => adapter.upload({ filename: "test", mimeType: "text/plain", body });
  const first = await Promise.allSettled([send(), send()]);
  expect(first.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  const retry = await send();
  expect([...files]).toEqual([retry.objectId]);
  expect(reservations.size).toBe(1);
});
