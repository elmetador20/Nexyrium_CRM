export const driveCategories = ["expense", "invoice", "document", "quotation"] as const;
export type DriveCategory = typeof driveCategories[number];
export const categoryLabel = { expense: "Expense", invoice: "Invoice", document: "Document", quotation: "Quotation" } as const;
