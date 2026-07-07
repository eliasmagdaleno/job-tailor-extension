import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
import ApiKeySection from "../src/options/sections/ApiKeySection";
import ProfileEditor from "../src/options/sections/ProfileEditor";

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
});
