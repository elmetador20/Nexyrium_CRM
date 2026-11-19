import { z } from "zod";

const optionalUuid = z.preprocess((value) => value === "" ? null : value, z.string().uuid().optional().nullable());
const positiveMinor = z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer minor-unit string.");

export const paymentCreateSchema = z.object({
  status: z.literal("posted").default("posted"),
  clientId: z.string().uuid(),
  departmentId: optionalUuid,
  amountMinor: positiveMinor,
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  receivedAt: z.coerce.date(),
  paymentMethod: z.string().trim().min(1).max(50),
  externalReference: z.string().trim().max(255).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(255),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amountMinor: positiveMinor })).default([]),
});

export const paymentListSchema = z.object({ clientId: optionalUuid });

export const paymentReversalSchema = z.object({ reason: z.string().trim().min(1).max(2_000) });

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
