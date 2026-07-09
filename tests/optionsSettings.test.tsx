import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/storage", () => ({
  getApiKey: vi.fn(async () => null),
  setApiKey: vi.fn(),
  getMasterProfile: vi.fn(async () => null),
  setMasterProfile: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: { runtime: { sendMessage: vi.fn() } },
}));

vi.mock("../src/lib/fileTextExtractor", () => ({
  extractText: vi.fn(),
  ExtractionError: class ExtractionError extends Error {},
}));

import * as storage from "../src/lib/storage";
import browser from "webextension-polyfill";
import * as fileTextExtractor from "../src/lib/fileTextExtractor";
import ApiKeySection from "../src/options/sections/ApiKeySection";
import ProfileEditor from "../src/options/sections/ProfileEditor";
import type { MasterProfile } from "../src/lib/types";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ApiKeySection", () => {
  it("saves the entered API key", async () => {
    render(<ApiKeySection />);
    const input = await screen.findByPlaceholderText("sk-ant-...");
    await userEvent.type(input, "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(storage.setApiKey).toHaveBeenCalledWith("sk-ant-test");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});

describe("ProfileEditor", () => {
  it("saves a manually-entered name and email", async () => {
    render(<ProfileEditor />);
    const nameInput = await screen.findByPlaceholderText("Full name");
    await userEvent.type(nameInput, "Jane Doe");
    await userEvent.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(storage.setMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({ contact: expect.objectContaining({ name: "Jane Doe", email: "jane@example.com" }) })
    );
  });

  it("adds and removes an experience entry", async () => {
    render(<ProfileEditor />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Experience" }));
    expect(screen.getByPlaceholderText("Company")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByPlaceholderText("Company")).not.toBeInTheDocument();
  });

  it("preserves in-progress bullet typing across newlines and normalizes on save", async () => {
    render(<ProfileEditor />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Experience" }));
    const bulletsTextarea = screen.getByPlaceholderText("One bullet per line") as HTMLTextAreaElement;

    await userEvent.type(bulletsTextarea, "First bullet{enter}Second bullet");

    // Typing a newline must not snap the textarea back to a single line.
    expect(bulletsTextarea.value).toBe("First bullet\nSecond bullet");

    await userEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(storage.setMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        experience: [expect.objectContaining({ bullets: ["First bullet", "Second bullet"] })],
      })
    );
  });

  it("saves a selected style preset with custom notes", async () => {
    render(<ProfileEditor />);
    const presetSelect = await screen.findByLabelText("Style");
    await userEvent.selectOptions(presetSelect, "formal");
    await userEvent.type(
      screen.getByPlaceholderText(/refine the tone/i),
      "Keep it upbeat but not cheesy."
    );
    await userEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(storage.setMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        coverLetterStyle: { preset: "formal", customNotes: "Keep it upbeat but not cheesy." },
      })
    );
  });

  it("saves a pasted reference cover letter", async () => {
    render(<ProfileEditor />);
    const referenceTextarea = await screen.findByLabelText(/Reference cover letter/i);
    await userEvent.type(referenceTextarea, "Dear Sir or Madam,");
    await userEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(storage.setMasterProfile).toHaveBeenCalledWith(
      expect.objectContaining({ coverLetterReference: "Dear Sir or Madam," })
    );
  });

  it("adds and removes a snippet", async () => {
    render(<ProfileEditor />);
    const snippetInput = await screen.findByPlaceholderText(/Type a snippet/i);
    await userEvent.type(snippetInput, "Passionate about accessible design{enter}");
    expect(screen.getByText("Passionate about accessible design")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove Passionate about accessible design" }));
    expect(screen.queryByText("Passionate about accessible design")).not.toBeInTheDocument();
  });

  it("shows an import-review status and does not persist until Save is clicked", async () => {
    const importedProfile: MasterProfile = {
      contact: { name: "Imported Name", email: "imported@example.com" },
      summary: "",
      experience: [],
      education: [],
      skills: [],
    };
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ ok: true, data: importedProfile });

    render(<ProfileEditor />);
    // Wait for the initial getApiKey() effect to resolve so handleImport
    // doesn't race the async load and hit the "no API key" branch.
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Import from resume file/)) as HTMLInputElement;
    const file = new File(["resume text"], "resume.txt", { type: "text/plain" });
    vi.mocked(fileTextExtractor.extractText).mockResolvedValue("resume text");

    await userEvent.upload(fileInput, file);

    expect(await screen.findByText("Imported — review below, then click Save Profile.")).toBeInTheDocument();
    expect(storage.setMasterProfile).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText("Full name")).toHaveValue("Imported Name");
  });

  it("surfaces the real error when the import fails", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      ok: false,
      error: "Claude API error (400): credit balance too low",
    });

    render(<ProfileEditor />);
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Import from resume file/)) as HTMLInputElement;
    const file = new File(["resume text"], "resume.txt", { type: "text/plain" });
    vi.mocked(fileTextExtractor.extractText).mockResolvedValue("resume text");

    await userEvent.upload(fileInput, file);

    expect(
      await screen.findByText(/Claude API error \(400\): credit balance too low/)
    ).toBeInTheDocument();
    expect(storage.setMasterProfile).not.toHaveBeenCalled();
  });

  it("imports a .pdf resume by routing it through extractText first", async () => {
    const importedProfile: MasterProfile = {
      contact: { name: "PDF Name", email: "pdf@example.com" },
      summary: "",
      experience: [],
      education: [],
      skills: [],
    };
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(fileTextExtractor.extractText).mockResolvedValue("## PDF Name\n\nExtracted resume text.");
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ ok: true, data: importedProfile });

    render(<ProfileEditor />);
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Import from resume file/)) as HTMLInputElement;
    const file = new File([], "resume.pdf", { type: "application/pdf" });

    await userEvent.upload(fileInput, file);

    expect(await screen.findByText("Imported — review below, then click Save Profile.")).toBeInTheDocument();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ resumeText: "## PDF Name\n\nExtracted resume text." })
    );
  });

  it("surfaces an ExtractionError message from a bad PDF/docx upload", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(fileTextExtractor.extractText).mockRejectedValue(
      new fileTextExtractor.ExtractionError("This PDF is password-protected. Remove the password or export as .txt/.md.")
    );

    render(<ProfileEditor />);
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Import from resume file/)) as HTMLInputElement;
    const file = new File([], "resume.pdf", { type: "application/pdf" });

    await userEvent.upload(fileInput, file);

    expect(
      await screen.findByText(/This PDF is password-protected\. Remove the password or export as \.txt\/\.md\./)
    ).toBeInTheDocument();
    expect(storage.setMasterProfile).not.toHaveBeenCalled();
  });

  it("imports a .docx reference cover letter by routing it through extractText", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(fileTextExtractor.extractText).mockResolvedValue("## Dear Hiring Manager\n\nI'm excited to apply.");

    render(<ProfileEditor />);
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Or upload a file/)) as HTMLInputElement;
    const file = new File([], "cover-letter.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await userEvent.upload(fileInput, file);

    // The default findByDisplayValue normalizer collapses whitespace in the
    // node's value before comparing, but does not normalize the search
    // string — so a value containing "\n\n" can never match a literal
    // "\n\n" search string via the default matcher. Disable normalization
    // so this asserts the exact extracted text, not a collapsed one.
    expect(
      await screen.findByDisplayValue("## Dear Hiring Manager\n\nI'm excited to apply.", {
        normalizer: (text) => text,
      })
    ).toBeInTheDocument();
  });

  it("surfaces an error when the reference cover letter file can't be converted", async () => {
    vi.mocked(storage.getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(fileTextExtractor.extractText).mockRejectedValue(
      new fileTextExtractor.ExtractionError("This PDF is password-protected. Remove the password or export as .txt/.md.")
    );

    render(<ProfileEditor />);
    await waitFor(() => expect(storage.getApiKey).toHaveResolved());
    const fileInput = (await screen.findByLabelText(/Or upload a file/)) as HTMLInputElement;
    const file = new File([], "cover-letter.pdf", { type: "application/pdf" });

    await userEvent.upload(fileInput, file);

    expect(
      await screen.findByText(/This PDF is password-protected\. Remove the password or export as \.txt\/\.md\./)
    ).toBeInTheDocument();
  });
});
