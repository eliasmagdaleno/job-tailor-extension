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
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test", parts: { resume: true, coverLetter: true } },
      callClaudeApi
    );
    expect(result).toEqual({ ok: true, data: { resume: { summary: "S", experience: [], skills: [] }, coverLetter: "C" } });
    // schema (4th arg) and an AbortSignal (5th arg) are forwarded for generation
    expect(callClaudeApi).toHaveBeenCalledWith(
      "sk-ant-test",
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ type: "object" }),
      expect.any(AbortSignal)
    );
  });

  it("threads coverLetterOptions through to the prompt on GENERATE_TAILORED", async () => {
    const callClaudeApi = vi.fn(async () => JSON.stringify({ coverLetter: "C" }));
    await handleMessage(
      {
        type: "GENERATE_TAILORED",
        jobData,
        profile,
        apiKey: "sk-ant-test",
        parts: { resume: false, coverLetter: true },
        coverLetterOptions: { includeReference: false, oneOffNote: "Mention I'm a long-time user." },
      },
      callClaudeApi
    );
    const messages = (callClaudeApi.mock.calls[0] as any)[2];
    const content = JSON.parse(messages[0].content);
    expect(content.candidateProfile.jobSpecificNote).toBe("Mention I'm a long-time user.");
  });

  it("imports a profile on IMPORT_PROFILE", async () => {
    const callClaudeApi = vi.fn(async () => JSON.stringify(profile));
    const result = await handleMessage(
      { type: "IMPORT_PROFILE", resumeText: "Jane Doe...", apiKey: "sk-ant-test" },
      callClaudeApi
    );
    expect(result).toEqual({ ok: true, data: profile });
  });

  it("passes no schema on IMPORT_PROFILE", async () => {
    const callClaudeApi = vi.fn(async () => JSON.stringify(profile));
    await handleMessage(
      { type: "IMPORT_PROFILE", resumeText: "Jane Doe...", apiKey: "sk-ant-test" },
      callClaudeApi
    );
    expect(callClaudeApi).toHaveBeenCalledWith("sk-ant-test", expect.any(String), expect.any(Array), undefined);
  });

  it("returns ok:false when the Claude call throws", async () => {
    const callClaudeApi = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test", parts: { resume: true, coverLetter: true } },
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

  it("writes a running then done status to storage on a successful GENERATE_TAILORED", async () => {
    const setGenerationStatus = vi.fn(async () => {});
    const callClaudeApi = vi.fn(async () => JSON.stringify({ coverLetter: "C" }));
    await handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test", parts: { resume: false, coverLetter: true } },
      callClaudeApi,
      setGenerationStatus
    );
    expect(setGenerationStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ phase: "running", jobData, parts: { resume: false, coverLetter: true } })
    );
    expect(setGenerationStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ phase: "done", jobData, output: { coverLetter: "C" } })
    );
  });

  it("writes an error status to storage when the Claude call throws a non-abort error", async () => {
    const setGenerationStatus = vi.fn(async () => {});
    const callClaudeApi = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test", parts: { resume: true, coverLetter: true } },
      callClaudeApi,
      setGenerationStatus
    );
    expect(result).toEqual({ ok: false, error: "network down" });
    expect(setGenerationStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "error", jobData, message: "network down" })
    );
  });

  it("marks generation as cancelled (not error) when CANCEL_GENERATION aborts an in-flight request", async () => {
    const setGenerationStatus = vi.fn(async () => {});
    let capturedSignal: AbortSignal | undefined;
    const callClaudeApi = vi.fn(
      (_apiKey: string, _system: string, _messages: unknown, _schema: unknown, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
    );

    const generatePromise = handleMessage(
      { type: "GENERATE_TAILORED", jobData, profile, apiKey: "sk-ant-test", parts: { resume: true, coverLetter: true } },
      callClaudeApi,
      setGenerationStatus
    );

    // let handleMessage's microtasks run so callClaudeApi has been called and
    // registered its abort listener before we cancel.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capturedSignal).toBeInstanceOf(AbortSignal);

    const cancelResult = await handleMessage({ type: "CANCEL_GENERATION" }, callClaudeApi, setGenerationStatus);
    expect(cancelResult).toEqual({ ok: true });

    const generateResult = await generatePromise;
    expect(generateResult).toEqual({ ok: false, error: "cancelled" });
    expect(setGenerationStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "cancelled", jobData, parts: { resume: true, coverLetter: true } })
    );
  });
});
