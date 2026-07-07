import { describe, it, expect } from "vitest";
import { buildWorkbookRows } from "../src/lib/xlsxExport";
import type { ApplicationRecord } from "../src/lib/types";

describe("buildWorkbookRows", () => {
  it("maps application records to spreadsheet rows", () => {
    const records: ApplicationRecord[] = [
      {
        id: "1",
        dateApplied: "2026-07-07",
        company: "Acme",
        jobTitle: "Product Designer",
        site: "Welcome to the Jungle",
        jobUrl: "https://example.com/job/1",
        status: "applied",
      },
    ];
    expect(buildWorkbookRows(records)).toEqual([
      {
        "Date Applied": "2026-07-07",
        Company: "Acme",
        "Job Title": "Product Designer",
        Site: "Welcome to the Jungle",
        Status: "applied",
        "Job URL": "https://example.com/job/1",
      },
    ]);
  });

  it("returns an empty array for no records", () => {
    expect(buildWorkbookRows([])).toEqual([]);
  });
});
