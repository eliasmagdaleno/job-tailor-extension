import * as XLSX from "xlsx";
import type { ApplicationRecord } from "./types";

export interface XlsxRow {
  "Date Applied": string;
  Company: string;
  "Job Title": string;
  Site: string;
  Status: string;
  "Job URL": string;
}

export function buildWorkbookRows(records: ApplicationRecord[]): XlsxRow[] {
  return records.map((r) => ({
    "Date Applied": r.dateApplied,
    Company: r.company,
    "Job Title": r.jobTitle,
    Site: r.site,
    Status: r.status,
    "Job URL": r.jobUrl,
  }));
}

export function downloadXlsx(records: ApplicationRecord[], filename = "job-applications.xlsx"): void {
  const rows = buildWorkbookRows(records);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Applications");
  XLSX.writeFile(workbook, filename);
}
