import { z } from "zod";
import { acquisitionSourceSchema } from "@/features/crm/leads/acquisition-source-schema";

import { LEAD_STATUSES } from "@/types/crm";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const leadIntakeSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(50),
  sourceIdentifier: z.string().trim().max(255).optional().nullable(),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  phoneCountryCode: z.string().trim().regex(/^\+?[1-9]\d{0,2}$/).optional().nullable(),
  companyName: optionalText(200),
  acquisitionSource: acquisitionSourceSchema,
  sourceDetails: optionalText(2_000),
  status: z.enum(LEAD_STATUSES).default("new"),
  ownerId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  notes: optionalText(10_000),
  nextAction: optionalText(500),
  nextActionAt: z.coerce.date().optional().nullable(),
});

export const manualCrmLeadSchema = leadIntakeSchema.extend({
  companyName:z.string().trim().min(1,"Enter the company name.").max(200),
  phone:z.string().trim().min(1,"Enter a phone number.").max(40),
});

export const duplicateResolutionSchema = z.object({
  decision: z.enum(["link_existing", "create_new", "reject"]),
  reviewerNotes: z.string().trim().max(2_000).optional().nullable(),
});

export type LeadIntakeInput = z.infer<typeof leadIntakeSchema>;
export type DuplicateResolutionInput = z.infer<typeof duplicateResolutionSchema>;
