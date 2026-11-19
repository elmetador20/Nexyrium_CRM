import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateFinancialPdf } from "@/features/finance/documents/artifact-service";
import { createGoogleDriveStorageAdapter } from "@/features/integrations/google-drive/adapter";

const state = vi.hoisted(() => ({ currentId: "old" }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "artifact", providerObjectId: state.currentId }] }) }) }),
    update: () => ({ set: ({ providerObjectId }: { providerObjectId: string }) => ({ where: () => ({ returning: async () => {
      state.currentId = providerObjectId;
      return [{ id: "artifact", providerObjectId }];
    } }) }) }),
  },
}));
vi.mock("@/features/finance/documents/pdf", () => ({
  renderFinancialPdf: async () => ({ body: Buffer.from("synthetic"), filename: "test.pdf", mimeType: "application/pdf", checksum: "source-checksum" }),
}));

beforeEach(() => { state.currentId = "old"; });

describe("matching financial artifact checksum", () => {
  it.each(["deleted", "moved", "file permission lost", "trashed", "correct", "temporary failure", "replacement inaccessible"])("checks the mapped folder when the object is %s", async scenario => {
    const md5 = createHash("md5").update("synthetic").digest("hex");
    const files = {
      get: vi.fn(async ({fileId}: {fileId: string}) => {
        if (fileId === "old" && scenario === "temporary failure") throw { response: { status: 503 } };
        if (fileId === "old" && scenario === "file permission lost") {
          throw { response: { status: 403, data: { error: { errors: [{ reason: "insufficientFilePermissions" }] } } } };
        }
        if (fileId === "old" && scenario === "deleted") throw { response: { status: 404 } };
        const moved = fileId === "old" && ["moved", "replacement inaccessible"].includes(scenario);
        return { data: { id: fileId, parents: [moved ? "elsewhere" : "mapped"], trashed: fileId === "old" && scenario === "trashed",
          md5Checksum: md5, capabilities: {canDownload: !(fileId === "replacement" && scenario === "replacement inaccessible")} } };
      }),
      create: vi.fn(async () => ({ data: { id: "replacement" } })),
    };
    const keys: string[] = [];
    const storage = createGoogleDriveStorageAdapter({ resolve: async request => {
      expect(request?.category).toBe("invoice");
      if (request?.operationKey) keys.push(request.operationKey);
      return { drive: { files } as never, folderId: "mapped", reservation: request?.operationKey ? { fileId: "replacement", complete: async () => {} } : undefined };
    } });
    const save = () => generateFinancialPdf({ invoiceId: "invoice", actorUserId: "actor", data: {} as never, storage });
    if (scenario === "temporary failure" || scenario === "replacement inaccessible") {
      await expect(save()).rejects.toThrow();
      expect(files.create).toHaveBeenCalledTimes(scenario === "temporary failure" ? 0 : 1);
      expect(state.currentId).toBe("old");
      return;
    }
    const expected = scenario === "correct" ? "old" : "replacement";
    expect((await save()).providerObjectId).toBe(expected);
    expect((await save()).providerObjectId).toBe(expected);
    expect(files.create).toHaveBeenCalledTimes(scenario === "correct" ? 0 : 1);
    if (keys.length) expect(JSON.parse(keys[0])).toEqual(["invoice", "source-checksum", "old"]);
  });
});
