"use client";
import "@/features/reports/components/workspace.css";


import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ClientSelector } from "./ClientSelector";
import { buildFinancialDocumentPayload, type FinancialFormLine } from "@/features/finance/shared/form-payload";
import { calculateLine, calculateTotals, formatMoney, majorToMinor, percentToBasisPoints } from "@/features/finance/shared/money";

const emptyLine = (): FinancialFormLine => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  discountRate: "0",
  taxRate: "0",
});

type FieldErrors = Record<string, string>;

export function FinancialDocumentForm({ kind, initialClient = null }: { kind: "quotation" | "invoice"; initialClient?: { id: string; name: string; companyName: string | null; email: string | null } | null }) {
  const [lines, setLines] = useState<FinancialFormLine[]>([emptyLine()]);
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const preview = useMemo(() => {
    try {
      const minorLines = lines.map((line) => ({
        quantity: line.quantity,
        unitPriceMinor: majorToMinor(line.unitPrice || "0", currencyCode),
        discountBps: percentToBasisPoints(line.discountRate || "0"),
        taxBps: percentToBasisPoints(line.taxRate || "0"),
      }));
      return {
        lineTotals: minorLines.map((line) => calculateLine(line).totalMinor),
        totals: calculateTotals(minorLines),
        error: null,
      };
    } catch (previewError) {
      return {
        lineTotals: lines.map(() => null),
        totals: null,
        error: previewError instanceof Error ? previewError.message : "Complete the line item values to preview totals.",
      };
    }
  }, [currencyCode, lines]);

  function update(index: number, field: keyof FinancialFormLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`line-${index}-${field}`];
      return next;
    });
  }

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const payload = buildFinancialDocumentPayload({
        title: formData.get("title"),
        notes: formData.get("notes"),
        paymentTerms: formData.get("paymentTerms"),
        dueDate: formData.get("dueDate"),
        currencyCode: formData.get("currencyCode"),
        clientId: typeof formData.get("clientId") === "string" ? String(formData.get("clientId")) : null,
        lines,
      });
      const response = await fetch(kind === "quotation" ? "/api/v1/quotations" : "/api/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const nextFieldErrors: FieldErrors = {};
        for (const field of result?.fields ?? []) {
          if (!Array.isArray(field.path) || typeof field.message !== "string") continue;
          if (field.path[0] === "lines" && typeof field.path[1] === "number" && typeof field.path[2] === "string") {
            const lineField = field.path[2] === "unitPriceMinor" ? "unitPrice" : field.path[2] === "discountBps" ? "discountRate" : field.path[2] === "taxBps" ? "taxRate" : field.path[2];
            nextFieldErrors[`line-${field.path[1]}-${lineField}`] = field.message;
          } else {
            nextFieldErrors[field.path.join(".")] = field.message;
          }
        }
        setFieldErrors(nextFieldErrors);
        setError(result?.error ?? "The document could not be saved.");
        return;
      }
      router.push(kind === "quotation" ? `/quotations/${result.id}` : `/finance/invoices/${result.id}`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The document could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="space-y-6" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={kind === "invoice" ? "Invoice title" : "Quotation title"} name="title" required error={fieldErrors.title} />
        <Field
          label="Currency"
          name="currencyCode"
          value={currencyCode}
          onChange={setCurrencyCode}
          helperText="Use a three-letter code such as INR, USD, or EUR."
          error={fieldErrors.currencyCode}
          required
        />
        <ClientSelector error={fieldErrors.clientId} initial={initialClient} />
        <Field label="Due date" name="dueDate" type="date" error={fieldErrors.dueDate} />
        <details className="md:col-span-2"><summary className="cursor-pointer text-sm font-medium">Payment terms and notes (optional)</summary><Field label="Payment terms" name="paymentTerms" as="textarea" rows={3} error={fieldErrors.paymentTerms} />
        <Field label="Notes" name="notes" as="textarea" rows={3} error={fieldErrors.notes} /></details>
      </div>

      <section className="card p-5" aria-labelledby="line-items-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="line-items-heading" className="font-semibold text-text-primary">Line items</h3>
            <p className="mt-1 text-sm text-text-secondary">Enter the service and its price, for example Website development, ₹50,000.</p>
          </div>
          <button className="button-secondary" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
            Add line
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {lines.map((line, index) => (
            <div className="rounded-lg border border-border bg-surface-hover/40 p-4" key={index}>
              <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
                <Field label="Description" name={`description-${index}`} value={line.description} onChange={(value) => update(index, "description", value)} error={fieldErrors[`line-${index}-description`]} required />
                <Field label="Quantity" name={`quantity-${index}`} value={line.quantity} onChange={(value) => update(index, "quantity", value)} inputMode="decimal" error={fieldErrors[`line-${index}-quantity`]} required />
                <Field label="Unit price" name={`unit-${index}`} value={line.unitPrice} onChange={(value) => update(index, "unitPrice", value)} inputMode="decimal" error={fieldErrors[`line-${index}-unitPriceMinor`]} required />
                <Field label="Discount %" name={`discount-${index}`} value={line.discountRate} onChange={(value) => update(index, "discountRate", value)} inputMode="decimal" error={fieldErrors[`line-${index}-discountBps`]} />
                <Field label="Tax %" name={`tax-${index}`} value={line.taxRate} onChange={(value) => update(index, "taxRate", value)} inputMode="decimal" error={fieldErrors[`line-${index}-taxBps`]} />
                <div className="space-y-2 text-sm font-medium">
                  <span className="label">Line total</span>
                  <output className="flex min-h-10 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text-primary">
                    {preview.lineTotals[index] ? formatMoney(preview.lineTotals[index], currencyCode) : "—"}
                  </output>
                </div>
                {lines.length > 1 ? (
                  <button className="self-end pb-2 text-sm font-medium text-danger underline underline-offset-2" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5" aria-labelledby="totals-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="totals-heading" className="font-semibold text-text-primary">Totals</h3>
            <p className="mt-1 text-sm text-text-secondary">Review the total before saving your draft.</p>
          </div>
          {preview.error ? <span className="text-sm text-warning">{preview.error}</span> : null}
        </div>
        <dl className="mt-4 ml-auto max-w-sm space-y-2 text-sm">
          <SummaryRow label="Subtotal" value={preview.totals ? formatMoney(preview.totals.subtotalMinor, currencyCode) : "—"} />
          <SummaryRow label="Discount" value={preview.totals ? formatMoney(preview.totals.discountMinor, currencyCode) : "—"} />
          <SummaryRow label="Tax" value={preview.totals ? formatMoney(preview.totals.taxMinor, currencyCode) : "—"} />
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-text-primary">
            <dt>Total</dt>
            <dd>{preview.totals ? formatMoney(preview.totals.totalMinor, currencyCode) : "—"}</dd>
          </div>
        </dl>
      </section>

      {error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="button-secondary" type="button" disabled={saving} onClick={() => router.back()}>Cancel</button>
        <button className="button-primary" disabled={saving} type="submit">{saving ? "Saving…" : kind === "invoice" ? "Save draft" : "Save quotation"}</button>
      </div>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-6 text-text-secondary"><dt>{label}</dt><dd className="font-medium text-text-primary">{value}</dd></div>;
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  value,
  onChange,
  inputMode,
  helperText,
  error,
  as = "input",
  rows,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  inputMode?: "decimal";
  helperText?: string;
  error?: string;
  as?: "input" | "textarea";
  rows?: number;
}) {
  const id = `field-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <label className="block space-y-2 text-sm font-medium text-text-primary" htmlFor={id}>
      <span className="label">{label}{required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span>
      {as === "textarea" ? (
        <textarea id={id} name={name} required={required} defaultValue={defaultValue} value={value} rows={rows} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={`input min-h-24 resize-y ${error ? "input-error" : ""}`} />
      ) : (
        <input id={id} className={`input ${error ? "input-error" : ""}`} name={name} type={type} required={required} defaultValue={defaultValue} value={value} inputMode={inputMode} onChange={onChange ? (event) => onChange(event.target.value) : undefined} aria-invalid={Boolean(error)} />
      )}
      {error ? <span className="block text-sm font-normal text-danger" role="alert">{error}</span> : helperText ? <span className="block text-sm font-normal text-text-muted">{helperText}</span> : null}
    </label>
  );
}
