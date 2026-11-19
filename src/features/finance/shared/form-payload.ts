import { majorToMinor, percentToBasisPoints } from "./money";

export type FinancialFormLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

export function optionalFormValue(value: FormDataEntryValue | null): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function buildFinancialDocumentPayload(input: {
  title: FormDataEntryValue | null;
  notes: FormDataEntryValue | null;
  paymentTerms: FormDataEntryValue | null;
  dueDate: FormDataEntryValue | null;
  currencyCode: FormDataEntryValue | null;
  clientId: string | null;
  lines: FinancialFormLine[];
}) {
  const currencyCode = String(input.currencyCode ?? "").trim().toUpperCase();
  if (!input.clientId) throw new Error("Select a client.");
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Enter a three-letter currency code.");

  return {
    title: String(input.title ?? ""),
    notes: optionalFormValue(input.notes),
    paymentTerms: optionalFormValue(input.paymentTerms),
    dueDate: optionalFormValue(input.dueDate),
    currencyCode,
    clientId: input.clientId,
    dealId: null,
    projectId: null,
    quotationId: null,
    lines: input.lines.map((line, index) => {
      if (!line.description.trim()) throw new Error(`Line ${index + 1}: enter a description.`);
      if (!line.quantity.trim()) throw new Error(`Line ${index + 1}: enter a quantity.`);
      if (!line.unitPrice.trim()) throw new Error(`Line ${index + 1}: enter a unit price.`);
      return {
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: majorToMinor(line.unitPrice, currencyCode),
        discountBps: percentToBasisPoints(line.discountRate),
        taxBps: percentToBasisPoints(line.taxRate),
      };
    }),
  };
}
