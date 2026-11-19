export const ACQUISITION_SOURCES = ["organic", "meta ad", "google ad", "partner"] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const ACQUISITION_LABELS: Record<AcquisitionSource, string> = {
  organic: "Organic",
  "meta ad": "Meta Ad",
  "google ad": "Google Ad",
  partner: "Partner",
};

export const ACQUISITION_PREFIX = "Nexyrium acquisition source: ";

export function parseAcquisitionSource(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return ACQUISITION_SOURCES.find((source) => source === normalized);
}

export function splitSourceDetails(details?: string | null) {
  if (details?.startsWith(ACQUISITION_PREFIX)) {
    const newline = details.indexOf("\n");
    const tag = details.slice(ACQUISITION_PREFIX.length, newline < 0 ? undefined : newline);
    const acquisitionSource = parseAcquisitionSource(tag);
    if (acquisitionSource) {
      return { acquisitionSource, details: newline < 0 ? null : details.slice(newline + 1) || null };
    }
  }
  return { acquisitionSource: undefined, details: details ?? null };
}

export function formatSourceDetails(details?: string | null, acquisitionSource?: AcquisitionSource | null) {
  if (!acquisitionSource) return details || null;
  return ACQUISITION_PREFIX + acquisitionSource + (details ? "\n" + details : "");
}

export function getAcquisitionSource(ingestion: string, details?: string | null) {
  return splitSourceDetails(details).acquisitionSource
    ?? parseAcquisitionSource(ingestion)
    ?? (ingestion.toLowerCase().startsWith("meta:") ? "meta ad" : undefined);
}
