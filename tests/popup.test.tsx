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

  it("shows 'Already logged on' immediately when the job was previously applied to, without clicking Generate", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer with 5 years of experience.",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(storage.findApplicationByUrl).mockResolvedValue({
      id: "abc123",
      dateApplied: "2026-07-01",
      company: "Acme",
      jobTitle: "Product Designer",
      site: "Welcome to the Jungle",
      jobUrl: "https://example.com/job/1",
      status: "applied",
    });
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue({
      title: "Product Designer",
      company: "Acme",
      description: "desc",
      url: "https://example.com/job/1",
      site: "Welcome to the Jungle",
      parsedVia: "structured",
    });

    render(<Popup />);
    expect(await screen.findByText(/Product Designer @ Acme/)).toBeInTheDocument();
    expect(await screen.findByText(/Already logged on 2026-07-01/)).toBeInTheDocument();
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("shows an error with a Retry button when the background message send rejects", async () => {
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
    vi.mocked(browser.runtime.sendMessage).mockRejectedValue(
      new Error("Could not establish connection. Receiving end does not exist.")
    );

    render(<Popup />);
    expect(await screen.findByText(/Product Designer @ Acme/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText(/Receiving end does not exist/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("explains the page is unsupported when no content script responds", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer with 5 years of experience.",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(browser.tabs.sendMessage).mockRejectedValue(
      new Error("Could not establish connection. Receiving end does not exist.")
    );

    render(<Popup />);
    expect(await screen.findByText(/doesn't look like a Welcome to the Jungle job page/i)).toBeInTheDocument();
  });

  it("explains no listing was found when the content script returns nothing", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer with 5 years of experience.",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue(null);

    render(<Popup />);
    expect(await screen.findByText(/Couldn't find a job listing on this page/i)).toBeInTheDocument();
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

  it("generates only a cover letter when 'Cover letter' is selected", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "s",
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
      data: { coverLetter: "Dear hiring team," },
    });

    render(<Popup />);
    fireEvent.click(await screen.findByRole("radio", { name: /cover letter/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Dear hiring team,")).toBeInTheDocument();
    // the message carried a cover-letter-only parts flag
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GENERATE_TAILORED", parts: { resume: false, coverLetter: true } })
    );
    // no résumé download button when no résumé was produced
    expect(screen.queryByRole("button", { name: /Download Résumé/i })).toBeNull();
  });

  it("does not show the reference-voice checkbox when no reference letter is saved", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "s",
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

    render(<Popup />);
    fireEvent.click(await screen.findByRole("radio", { name: /cover letter/i }));
    expect(screen.queryByLabelText(/match my reference letter/i)).toBeNull();
  });

  it("sends coverLetterOptions with includeReference and a one-off note when generating a cover letter", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "s",
      experience: [],
      education: [],
      skills: [],
      coverLetterReference: "Dear Sir or Madam,",
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
      data: { coverLetter: "Dear hiring team," },
    });

    render(<Popup />);
    fireEvent.click(await screen.findByRole("radio", { name: /cover letter/i }));

    const referenceCheckbox = await screen.findByLabelText(/match my reference letter/i);
    fireEvent.click(referenceCheckbox);

    const noteField = screen.getByPlaceholderText(/anything specific to mention/i);
    fireEvent.change(noteField, { target: { value: "I've used their product for years." } });

    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Dear hiring team,")).toBeInTheDocument();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GENERATE_TAILORED",
        coverLetterOptions: { includeReference: true, oneOffNote: "I've used their product for years." },
      })
    );
  });

  it("omits coverLetterOptions for a résumé-only generation", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "s",
      experience: [],
      education: [],
      skills: [],
      coverLetterReference: "Dear Sir or Madam,",
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
      data: { resume: { summary: "S", experience: [], skills: [] } },
    });

    render(<Popup />);
    fireEvent.click(await screen.findByRole("radio", { name: /résumé/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await screen.findByText("Preview");
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GENERATE_TAILORED", coverLetterOptions: undefined })
    );
  });

  it("shows a settings gear that opens the options page in every state", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(storage.getMasterProfile).mockResolvedValue({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "s",
      experience: [],
      education: [],
      skills: [],
    });
    vi.mocked(storage.findApplicationByUrl).mockResolvedValue(null);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue(null); // "ready" with no job
    render(<Popup />);
    const gear = await screen.findByRole("button", { name: /settings|edit profile/i });
    fireEvent.click(gear);
    expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
