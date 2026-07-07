import { describe, it, expect, vi } from "vitest";
import { handleMessage } from "../src/background/messageHandler";
import type { JobData, MasterProfile } from "../src/lib/types";

const jobData: JobData = {
  title: "Product Designer",
  company: "Acme",
  description: "Design things.",
  url: "https://www.welcome-to-the-jungle.com/jobs/1",
  site: "Welcome to the Jungle",
  parsedVia: "structured",
};

const profile: MasterProfile = {
  contact: { name: "Jane Doe", email: "jane@example.com" },
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

describe("handleMessage", () => {
  it("generates a tailored output on GENERATE_TAILORED", async () => {
    const callClaudeApi = vi.fn(async () =>
      JSON.stringify({ resume: { summary: "S", experience: [], skills: [] }, coverLetter: "C" })
    );
    const result = await handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test" },
      callClaudeApi
    );
    expect(result).toEqual({ ok: true, data: { resume: { summary: "S", experience: [], skills: [] }, coverLetter: "C" } });
    expect(callClaudeApi).toHaveBeenCalledWith("sk-ant-test", expect.any(String), expect.any(Array));
  });

  it("imports a profile on IMPORT_PROFILE", async () => {
    const callClaudeApi = vi.fn(async () => JSON.stringify(profile));
    const result = await handleMessage(
      { type: "IMPORT_PROFILE", resumeText: "Jane Doe...", apiKey: "sk-ant-test" },
      callClaudeApi
    );
    expect(result).toEqual({ ok: true, data: profile });
  });

  it("returns ok:false when the Claude call throws", async () => {
    const callClaudeApi = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test" },
      callClaudeApi
    );
    expect(result).toEqual({ ok: false, error: "network down" });
  });

  it("returns ok:false for an unknown message type", async () => {
    const callClaudeApi = vi.fn();
    // @ts-expect-error testing an invalid message type deliberately
    const result = await handleMessage({ type: "UNKNOWN" }, callClaudeApi);
    expect(result.ok).toBe(false);
  });
});
