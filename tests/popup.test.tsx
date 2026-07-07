import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
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
      summary: "Product designer with 5 years of experience.",
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

  it("prompts for profile setup when the saved profile is empty", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "", email: "" },
      summary: "",
      experience: [],
      education: [],
      skills: [],
    });

    render(<Popup />);
    expect(await screen.findByText(/Fill in your profile/i)).toBeInTheDocument();
  });

  it("logs the application only once on double-click of Mark as Applied", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer with 5 years of experience.",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(storage.findApplicationByUrl).mockResolvedValue(null);
    vi.mocked(storage.addApplication).mockResolvedValue(undefined);
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

    const markButton = screen.getByRole("button", { name: "Mark as Applied" });
    // Fire two clicks back-to-back without awaiting between them, simulating a
    // rapid double-click. If the button disables after the first click, the
    // second click on a disabled button must not fire the handler again.
    fireEvent.click(markButton);
    fireEvent.click(markButton);

    await screen.findByText(/Already logged on/);

    expect(storage.addApplication).toHaveBeenCalledTimes(1);
  });
});
