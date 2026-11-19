import { z } from "zod";

const metaChangeValueSchema = z.object({
  leadgen_id: z.string().trim().min(1).optional(),
  page_id: z.string().trim().min(1).optional(),
  form_id: z.string().trim().min(1).optional(),
  ad_id: z.string().trim().min(1).optional(),
  adgroup_id: z.string().trim().min(1).optional(),
  created_time: z.coerce.number().optional(),
}).passthrough();

export const metaWebhookPayloadSchema = z.object({
  object: z.string().trim().min(1),
  entry: z.array(z.object({
    id: z.string().trim().min(1),
    time: z.coerce.number().optional(),
    changes: z.array(z.object({ field: z.string().trim().min(1), value: metaChangeValueSchema })).default([]),
  })).min(1),
}).passthrough();

export type MetaWebhookPayload = z.infer<typeof metaWebhookPayloadSchema>;

export type MetaLeadRecord = {
  providerLeadId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
  createdTime: number | null;
  fieldData: Record<string, string>;
};

export function parseMetaWebhookPayload(payload: unknown): MetaLeadRecord[] {
  const parsed = metaWebhookPayloadSchema.parse(payload);
  if (parsed.object !== "page") throw new Error("Meta webhook object must be page.");
  const records: MetaLeadRecord[] = [];
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen" || !change.value.leadgen_id) continue;
      records.push({
        providerLeadId: change.value.leadgen_id,
        pageId: change.value.page_id ?? entry.id,
        formId: change.value.form_id ?? null,
        adId: change.value.ad_id ?? null,
        createdTime: change.value.created_time ?? null,
        fieldData: {},
      });
    }
  }
  if (!records.length) throw new Error("Meta webhook did not contain a leadgen change.");
  return records;
}

export function parseMetaLeadResponse(payload: unknown, providerLeadId: string, pageId: string, formId: string | null, adId: string | null, createdTime: number | null): MetaLeadRecord {
  const parsed = z.object({
    id: z.string().trim().min(1).optional(),
    created_time: z.coerce.number().optional(),
    field_data: z.array(z.object({ field: z.string().trim().min(1), values: z.array(z.unknown()).min(1) })).default([]),
  }).passthrough().parse(payload);
  const fieldData: Record<string, string> = {};
  for (const field of parsed.field_data) {
    const value = field.values.find((item) => item !== null && item !== undefined && String(item).trim());
    if (value !== undefined) fieldData[field.field] = String(value).trim();
  }
  return { providerLeadId: parsed.id ?? providerLeadId, pageId, formId, adId, createdTime: parsed.created_time ?? createdTime, fieldData };
}

export function metaLeadToIntakeInput(record: MetaLeadRecord, input: { source: string; ownerId?: string | null; departmentId?: string | null }) {
  const field = (...names: string[]) => names.map((name) => record.fieldData[name]).find(Boolean) ?? null;
  const firstName = field("first_name", "firstname");
  const lastName = field("last_name", "lastname");
  const contactName = field("full_name", "name") ?? [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!contactName) throw new Error("Meta lead did not contain a contact name.");
  return {
    eventId: `meta:${record.providerLeadId}`,
    source: input.source,
    sourceIdentifier: record.providerLeadId,
    contactName,
    email: field("email", "email_address"),
    phone: field("phone_number", "phone", "mobile_phone"),
    phoneCountryCode: field("phone_country_code", "country_code"),
    companyName: field("company_name", "company"),
    sourceDetails: `Meta Lead Ads page ${record.pageId}${record.formId ? ` form ${record.formId}` : ""}`,
    ownerId: input.ownerId ?? null,
    departmentId: input.departmentId ?? null,
  };
}
