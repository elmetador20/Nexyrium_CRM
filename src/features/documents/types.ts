export type DocumentRecordType = "lead" | "client" | "deal";

export type DocumentListInput = {
  recordType?: DocumentRecordType;
  recordId?: string;
  page: number;
  pageSize: number;
};
