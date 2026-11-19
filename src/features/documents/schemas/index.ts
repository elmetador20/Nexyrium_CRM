import { z } from "zod";

export const documentRecordTypeSchema = z.enum(["lead", "client", "deal"]);

export const documentListSchema = z.object({
  recordType: documentRecordTypeSchema.optional(),
  recordId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const documentMetadataSchema = z.object({
  title: z.string().trim().min(1).max(255),
  category: z.string().trim().max(100).optional().nullable(),
  recordType: documentRecordTypeSchema,
  recordId: z.string().uuid(),
});

export const documentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().max(100).optional().nullable(),
});

export type DocumentListInput = z.infer<typeof documentListSchema>;
export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;
