import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/storage", () => ({
  getApiKey: vi.fn(),
  getMasterProfile: vi.fn(),
  findApplicationByUrl: vi.fn(),
  addApplication: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(async () => null),
    },
    runtime: {
      sendMessage: vi.fn(),
      openOptionsPage: vi.fn(),
    },
  },
}));

import * as storage from "../src/lib/storage";
import browser from "webextension-polyfill";
import Popup from "../src/popup/Popup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Popup", () => {
  it("prompts for setup when no API key is set", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue(null);
    render(<Popup />);
    expect(await screen.findByText(/Anthropic API key/i)).toBeInTheDocument();
  });

  it("shows parsed job info and renders a preview after generating", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(storage.findApplicationByUrl).mockResolvedValue(null);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue({
      title: "Product Designer",
      company: "Acme",
      description: "desc",
      url: "https://example.com/job/1",
      site: "Welcome to the Jungle",
      parsedVia: "structured",
    });
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      ok: true,
      data: {
        resume: { summary: "Tailored summary", experience: [], skills: [] },
        coverLetter: "Dear hiring team,",
      },
    });

    render(<Popup />);
    expect(await screen.findByText(/Product Designer @ Acme/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Tailored summary")).toBeInTheDocument();
  });
});
