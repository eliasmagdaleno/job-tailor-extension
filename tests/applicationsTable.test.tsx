import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/storage", () => ({
  getApplications: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

vi.mock("../src/lib/xlsxExport", () => ({
  downloadXlsx: vi.fn(),
}));

import * as storage from "../src/lib/storage";
import { downloadXlsx } from "../src/lib/xlsxExport";
import ApplicationsTable from "../src/options/sections/ApplicationsTable";

const record = {
  id: "1",
  dateApplied: "2026-07-07",
  company: "Acme",
  jobTitle: "Product Designer",
  site: "Welcome to the Jungle" as const,
  jobUrl: "https://example.com/job/1",
  status: "applied" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storage.getApplications).mockResolvedValue([record]);
});

afterEach(cleanup);

describe("ApplicationsTable", () => {
  it("lists logged applications", async () => {
    render(<ApplicationsTable />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
  });

  it("exports the current records to xlsx", async () => {
    render(<ApplicationsTable />);
    await screen.findByText("Acme");
    await userEvent.click(screen.getByRole("button", { name: "Export .xlsx" }));
    expect(downloadXlsx).toHaveBeenCalledWith([record]);
  });

  it("deletes a record", async () => {
    render(<ApplicationsTable />);
    await screen.findByText("Acme");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(storage.deleteApplication).toHaveBeenCalledWith("1");
  });
});
