import "server-only";

import { createConfiguredGoogleDriveStorageAdapter } from "@/features/integrations/google-drive";

import { createQuotationService } from "@/features/quotations/services";
import { createInvoiceService } from "@/features/invoices/services";
import { createPaymentService } from "@/features/payments/services";

export const quotationService = createQuotationService();
export const invoiceService = createInvoiceService();
export const paymentService = createPaymentService();

export function financeStorage() {
  return createConfiguredGoogleDriveStorageAdapter();
}
