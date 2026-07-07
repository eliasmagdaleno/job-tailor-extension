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

import * as storage from "../src/lib/storage";
import browser from "webextension-polyfill";
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
    const fileInput = (await screen.findByLabelText("Import from resume file")) as HTMLInputElement;
    const file = new File(["resume text"], "resume.txt", { type: "text/plain" });
    // jsdom's File/Blob doesn't implement text() — stub it so handleImport's
    // `await file.text()` resolves as it would in a real browser.
    file.text = vi.fn().mockResolvedValue("resume text");

    await userEvent.upload(fileInput, file);

    expect(await screen.findByText("Imported — review below, then click Save Profile.")).toBeInTheDocument();
    expect(storage.setMasterProfile).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText("Full name")).toHaveValue("Imported Name");
  });
});
