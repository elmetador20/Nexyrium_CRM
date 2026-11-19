import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { currencyFractionDigits } from "@/features/finance/shared/money";

export const PDF_RENDERER_VERSION = "finance-pdf-v2-premium";

type FinancialPdfClient = {
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type FinancialPdfLine = {
  description: string;
  quantity: string;
  unitPriceMinor: string;
  discountBps?: number;
  lineDiscountMinor?: string;
  taxBps?: number;
  lineTaxMinor?: string;
  lineTotalMinor: string;
};

export type FinancialPdfInput = {
  documentType: "quotation" | "invoice";
  number: string | null;
  title: string;
  status?: string | null;
  currencyCode: string;
  issueDate?: string | Date | null;
  dueDate?: string | Date | null;
  paymentTerms?: string | null;
  notes?: string | null;
  client?: FinancialPdfClient | null;
  subtotalMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
  amountPaidMinor?: string;
  balanceDueMinor?: string;
  lines: FinancialPdfLine[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_CONTENT_Y = PAGE_HEIGHT - 82;

const COLORS = {
  navy: "#111827",
  navySoft: "#24324A",
  gold: "#C99A2E",
  text: "#172033",
  muted: "#667085",
  border: "#D9DEE8",
  surface: "#F5F7FA",
  white: "#FFFFFF",
  success: "#067647",
  warning: "#B54708",
  danger: "#B42318",
};

const DEVANAGARI_FONT = join(process.cwd(), "public", "fonts", "NotoSansDevanagari-Regular.woff2");

function parseMinor(value: string | undefined | null): bigint {
  return /^\d+$/.test(String(value ?? "")) ? BigInt(String(value)) : BigInt(0);
}

function groupInteger(value: string, indian: boolean): string {
  if (!indian) return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (value.length <= 3) return value;
  const lastThree = value.slice(-3);
  const leading = value.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${leading},${lastThree}`;
}

function currencySymbol(currencyCode: string): string {
  return ({
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    AED: "د.إ",
  } as Record<string, string>)[currencyCode] ?? `${currencyCode} `;
}

function formatMoney(minor: string | undefined | null, currencyCode: string): string {
  const normalized = currencyCode.trim().toUpperCase();
  let fractionDigits = 2;
  try {
    fractionDigits = currencyFractionDigits(normalized);
  } catch {
    // Invoice records are validated before reaching the renderer. Retain a
    // readable fallback if an old record contains an unsupported currency.
  }

  const raw = parseMinor(minor).toString().padStart(fractionDigits + 1, "0");
  const splitAt = Math.max(1, raw.length - fractionDigits);
  const whole = raw.slice(0, splitAt);
  const fraction = fractionDigits > 0 ? raw.slice(splitAt) : "";
  const grouped = groupInteger(whole, normalized === "INR");
  return `${currencySymbol(normalized)}${grouped}${fractionDigits > 0 ? `.${fraction}` : ""}`;
}

function drawMoneyText(document: PDFKit.PDFDocument, value: string, x: number, y: number, width: number, options: { fontSize?: number; color?: string; align?: "right" } = {}) {
  const fontSize = options.fontSize ?? 9;
  const color = options.color ?? COLORS.text;
  const align = options.align ?? "right";
  document.save();
  try {
    // Keep the numeric portion on a standard PDF font. Some PDF viewers render
    // the previously embedded Latin subset as white/empty glyphs. The symbol
    // is drawn separately with the Devanagari font only when it is available.
    if (!value.startsWith("₹") || !existsSync(DEVANAGARI_FONT)) {
      document.fillColor(color).font("Helvetica").fontSize(fontSize).text(value.replace(/^₹/, "INR "), x, y, { width, align });
      return;
    }

    const symbol = "₹";
    const remainder = value.slice(1);
    document.font(DEVANAGARI_FONT).fontSize(fontSize);
    const symbolWidth = document.widthOfString(symbol);
    document.font("Helvetica").fontSize(fontSize);
    const remainderWidth = document.widthOfString(remainder);
    const totalWidth = symbolWidth + remainderWidth;
    const startX = align === "right" ? x + width - totalWidth : x;
    document.fillColor(color).font(DEVANAGARI_FONT).fontSize(fontSize).text(symbol, startX, y, { lineBreak: false });
    document.fillColor(color).font("Helvetica").fontSize(fontSize).text(remainder, startX + symbolWidth, y, { lineBreak: false });
  } finally {
    document.restore();
  }
}

function percentage(basisPoints = 0): string {
  return `${(basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 2)}%`;
}

function dateText(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function safeText(value: string | null | undefined, fallback = "—"): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function statusColor(status: string | null | undefined): string {
  if (status === "paid") return COLORS.success;
  if (status === "overdue") return COLORS.warning;
  if (status === "voided") return COLORS.danger;
  return COLORS.navySoft;
}

function logoBuffer(): Buffer | null {
  const candidates = [
    join(process.cwd(), "public", "Logo.png"),
    join(process.cwd(), "public", "logo.png"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  return path ? readFileSync(path) : null;
}

function drawHeader(document: PDFKit.PDFDocument, input: FinancialPdfInput, logo: Buffer | null): number {
  document.save().rect(0, 0, PAGE_WIDTH, 116).fill(COLORS.navy).restore();

  if (logo) {
    document.image(logo, MARGIN, 15, { fit: [94, 86], valign: "center" });
  }

  document.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(19).text("Nexyrium", 153, 29);
  document.fillColor("#D7DCE6").font("Helvetica").fontSize(8).text("Business operations platform", 154, 55);

  document.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(25).text(input.documentType === "invoice" ? "INVOICE" : "QUOTATION", PAGE_WIDTH - 216, 24, { width: 172, align: "right" });
  const status = safeText(input.status, "draft").replaceAll("_", " ").toUpperCase();
  const statusWidth = Math.max(60, document.widthOfString(status) + 18);
  document.roundedRect(PAGE_WIDTH - MARGIN - statusWidth, 66, statusWidth, 22, 11).fill(statusColor(input.status));
  document.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8).text(status, PAGE_WIDTH - MARGIN - statusWidth, 73, { width: statusWidth, align: "center" });

  return 143;
}

function drawLabel(document: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  document.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x, y, { width });
  document.fillColor(COLORS.text).font("Helvetica").fontSize(9.5).text(value, x, y + 12, { width });
}

function drawDocumentSummary(document: PDFKit.PDFDocument, input: FinancialPdfInput, y: number): number {
  document.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(13).text(input.title, MARGIN, y, { width: 330 });
  document.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(`Currency: ${input.currencyCode.toUpperCase()}`, MARGIN, y + 20);

  const rightX = PAGE_WIDTH - MARGIN - 178;
  drawLabel(document, "Invoice number", safeText(input.number, "Draft"), rightX, y - 1, 178);
  drawLabel(document, "Issue date", dateText(input.issueDate), rightX, y + 32, 84);
  drawLabel(document, "Due date", dateText(input.dueDate), rightX + 94, y + 32, 84);
  return y + 78;
}

function drawBillTo(document: PDFKit.PDFDocument, input: FinancialPdfInput, y: number): number {
  document.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor(COLORS.border).stroke();
  document.fillColor(COLORS.navySoft).font("Helvetica-Bold").fontSize(9).text("BILL TO", MARGIN, y + 16);
  document.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text(safeText(input.client?.name), MARGIN, y + 34, { width: 235 });
  let leftY = y + 51;
  for (const value of [input.client?.companyName, input.client?.email, input.client?.phone, input.client?.website]) {
    if (!value?.trim()) continue;
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(value.trim(), MARGIN, leftY, { width: 235 });
    leftY += 13;
  }

  const rightX = PAGE_WIDTH - MARGIN - 178;
  drawLabel(document, "Payment terms", safeText(input.paymentTerms), rightX, y + 15, 178);
  drawLabel(document, "Reference", safeText(input.number, "Draft document"), rightX, y + 48, 178);
  return Math.max(leftY, y + 86);
}

function drawTableHeader(document: PDFKit.PDFDocument, y: number): number {
  const widths = [205, 42, 82, 52, 52, 78];
  const labels = ["Description", "Qty", "Unit price", "Discount", "Tax", "Line total"];
  let x = MARGIN;
  document.roundedRect(MARGIN, y, CONTENT_WIDTH, 25, 4).fill(COLORS.surface);
  labels.forEach((label, index) => {
    document.fillColor(COLORS.navySoft).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x + 6, y + 8, { width: widths[index] - 12, align: index === 0 ? "left" : "right" });
    x += widths[index];
  });
  return y + 25;
}

function addContinuationPage(document: PDFKit.PDFDocument, documentType: FinancialPdfInput["documentType"]): number {
  document.addPage({ size: "A4", margin: MARGIN });
  document.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(
    `${documentType === "invoice" ? "INVOICE" : "QUOTATION"} CONTINUED`,
    MARGIN,
    30,
    { width: CONTENT_WIDTH, align: "right" },
  );
  return drawTableHeader(document, 56);
}

function drawLineItems(document: PDFKit.PDFDocument, input: FinancialPdfInput, y: number): number {
  const widths = [205, 42, 82, 52, 52, 78];
  y = drawTableHeader(document, y);

  input.lines.forEach((line, index) => {
    const description = safeText(line.description);
    document.font("Helvetica").fontSize(9);
    const descriptionHeight = document.heightOfString(description, { width: widths[0] - 12, lineGap: 2 });
    const rowHeight = Math.max(34, descriptionHeight + 16);
    if (y + rowHeight > BOTTOM_CONTENT_Y) {
      y = addContinuationPage(document, input.documentType);
    }

    if (index % 2 === 1) document.rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#FBFCFE");
    document.moveTo(MARGIN, y + rowHeight).lineTo(PAGE_WIDTH - MARGIN, y + rowHeight).strokeColor(COLORS.border).stroke();

    let x = MARGIN;
    document.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(description, x + 6, y + 9, { width: widths[0] - 12, lineGap: 2 });
    x += widths[0];
    const cells = [
      line.quantity,
      formatMoney(line.unitPriceMinor, input.currencyCode),
      percentage(line.discountBps),
      percentage(line.taxBps),
      formatMoney(line.lineTotalMinor, input.currencyCode),
    ];
    cells.forEach((value, cellIndex) => {
      const isUnitPrice = cellIndex === 1;
      const isTax = cellIndex === 3;
      const isTotal = cellIndex === 4;
      if (isUnitPrice || isTotal) {
        drawMoneyText(document, value, x + 5, y + 10, widths[cellIndex + 1] - 10, { fontSize: 8.5, color: isTotal ? COLORS.navy : COLORS.text });
      } else if (isTax) {
        document.fillColor(COLORS.muted).font("Helvetica").fontSize(7.3).text(value, x + 5, y + 7, { width: widths[cellIndex + 1] - 10, align: "right" });
        drawMoneyText(document, formatMoney(line.lineTaxMinor, input.currencyCode), x + 5, y + 18, widths[cellIndex + 1] - 10, { fontSize: 7.3, color: COLORS.muted });
      } else {
        document.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(value, x + 5, y + 10, { width: widths[cellIndex + 1] - 10, align: "right" });
      }
      x += widths[cellIndex + 1];
    });
    y += rowHeight;
  });

  return y;
}

function drawTotals(document: PDFKit.PDFDocument, input: FinancialPdfInput, y: number): number {
  const boxHeight = 146;
  if (y + boxHeight > BOTTOM_CONTENT_Y) {
    document.addPage({ size: "A4", margin: MARGIN });
    document.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text("TOTALS & PAYMENT", MARGIN, 30);
    y = 56;
  } else {
    y += 22;
  }

  const x = PAGE_WIDTH - MARGIN - 235;
  document.roundedRect(x, y, 235, boxHeight, 6).fill("#FBFCFE").strokeColor(COLORS.border).stroke();
  const row = (label: string, value: string, rowY: number, strong = false) => {
    document.fillColor(strong ? COLORS.navy : COLORS.muted).font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9).text(label, x + 14, rowY, { width: 108 });
    drawMoneyText(document, value, x + 122, rowY, 99, { fontSize: strong ? 11 : 9, color: strong ? COLORS.navy : COLORS.text });
  };
  row("Subtotal", formatMoney(input.subtotalMinor, input.currencyCode), y + 18);
  row("Discount", formatMoney(input.discountMinor, input.currencyCode), y + 39);
  row("Tax", formatMoney(input.taxMinor, input.currencyCode), y + 60);
  document.moveTo(x + 14, y + 82).lineTo(x + 221, y + 82).strokeColor(COLORS.border).stroke();
  row("Grand total", formatMoney(input.totalMinor, input.currencyCode), y + 94, true);
  if (input.documentType === "invoice") {
    row("Amount paid", formatMoney(input.amountPaidMinor ?? "0", input.currencyCode), y + 116);
    row("Balance due", formatMoney(input.balanceDueMinor ?? input.totalMinor, input.currencyCode), y + 134, true);
  }
  return y + boxHeight;
}

function drawNotes(document: PDFKit.PDFDocument, input: FinancialPdfInput, y: number): number {
  const blocks = [
    input.paymentTerms?.trim() ? ["Payment terms", input.paymentTerms.trim()] : null,
    input.notes?.trim() ? ["Notes", input.notes.trim()] : null,
  ].filter((value): value is [string, string] => Boolean(value));
  if (!blocks.length) return y;

  if (y + 34 > BOTTOM_CONTENT_Y) {
    document.addPage({ size: "A4", margin: MARGIN });
    y = 56;
  } else {
    y += 24;
  }
  for (const [label, value] of blocks) {
    document.font("Helvetica").fontSize(8.5);
    const height = document.heightOfString(value, { width: CONTENT_WIDTH - 18, lineGap: 2 });
    if (y + height + 28 > BOTTOM_CONTENT_Y) {
      document.addPage({ size: "A4", margin: MARGIN });
      y = 56;
    }
    document.fillColor(COLORS.navySoft).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), MARGIN, y);
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(value, MARGIN, y + 13, { width: CONTENT_WIDTH - 18, lineGap: 2 });
    y += height + 34;
  }
  return y;
}

function drawFooters(document: PDFKit.PDFDocument) {
  const range = document.bufferedPageRange();
  // Keep the text inside PDFKit's bottom margin. Passing a y-coordinate below
  // maxY makes PDFKit auto-create a new page for the footer, which resulted in
  // blank/footer-only pages after the actual invoice content.
  const footerTextY = PAGE_HEIGHT - 68;
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    document.switchToPage(pageIndex);
    document.moveTo(MARGIN, PAGE_HEIGHT - 53).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 53).strokeColor(COLORS.border).stroke();
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text("Nexyrium", MARGIN, footerTextY, { width: 150 });
    document.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(`Page ${pageIndex - range.start + 1} of ${range.count}`, PAGE_WIDTH - MARGIN - 100, footerTextY, { width: 100, align: "right" });
  }
}

function filenameFor(input: FinancialPdfInput): string {
  const type = input.documentType === "invoice" ? "Invoice" : "Quotation";
  const number = (input.number ?? "Draft").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `Nexyrium-${type}-${number}.pdf`;
}

export async function renderFinancialPdf(input: FinancialPdfInput) {
  const document = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    compress: false,
    info: {
      Title: `${input.documentType === "invoice" ? "Invoice" : "Quotation"} ${input.number ?? "Draft"}`,
      Author: "Nexyrium",
      Subject: `${input.title} | ${safeText(input.client?.name, "Client unavailable")} | ${input.currencyCode.toUpperCase()} | total ${input.totalMinor} minor units`,
    },
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  let y = drawHeader(document, input, logoBuffer());
  y = drawDocumentSummary(document, input, y);
  y = drawBillTo(document, input, y);
  y = drawLineItems(document, input, y + 18);
  y = drawTotals(document, input, y);
  drawNotes(document, input, y);
  drawFooters(document);
  document.end();

  const body = await finished;
  return {
    body,
    checksum: createHash("sha256").update(body).digest("hex"),
    filename: filenameFor(input),
    mimeType: "application/pdf" as const,
    rendererVersion: PDF_RENDERER_VERSION,
  };
}
