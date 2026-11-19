export const LEAD_NORMALIZATION_VERSION = "v1";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  return cleaned ? cleaned.toLowerCase() : null;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhone(
  value: string | null | undefined,
  phoneCountryCode?: string | null,
): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;

  const rawDigits = digits(cleaned);
  if (cleaned.startsWith("+")) {
    return rawDigits.length >= 8 && rawDigits.length <= 15 ? `+${rawDigits}` : null;
  }

  const countryCode = clean(phoneCountryCode);
  if (!countryCode) return null;

  const countryDigits = digits(countryCode);
  if (!countryDigits || countryDigits.length > 3) return null;
  const nationalDigits = rawDigits.startsWith("0") ? rawDigits.slice(1) : rawDigits;
  const normalized = `+${countryDigits}${nationalDigits}`;
  const normalizedDigits = digits(normalized);
  return normalizedDigits.length >= 8 && normalizedDigits.length <= 15 ? normalized : null;
}

export function normalizeLeadContact(input: {
  email?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
}) {
  return {
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone, input.phoneCountryCode),
    normalizationVersion: LEAD_NORMALIZATION_VERSION,
  };
}
