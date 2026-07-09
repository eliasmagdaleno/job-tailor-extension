import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildTailorRequest,
  parseTailorResponse,
  callClaudeApi,
  buildTailoredOutputSchema,
} from "../src/lib/anthropicClient";
import type { JobData, MasterProfile } from "../src/lib/types";

const jobData: JobData = {
  title: "Product Designer",
  company: "Acme",
  location: "Paris, France",
  description: "Design end-to-end product experiences.",
  url: "https://www.welcome-to-the-jungle.com/en/companies/acme/jobs/product-designer",
  site: "Welcome to the Jungle",
  parsedVia: "structured",
};

const profile: MasterProfile = {
  contact: { name: "Jane Doe", email: "jane@example.com" },
  summary: "Product designer with 5 years of experience.",
  experience: [
    {
      company: "Widgets Inc",
      title: "Senior Designer",
      startDate: "2021",
      endDate: "Present",
      bullets: ["Led redesign of core checkout flow, increasing conversion 12%."],
    },
  ],
  education: [],
  skills: ["Figma", "User Research"],
};

describe("buildTailorRequest", () => {
  it("includes the job and profile data in the user message", () => {
    const { system, messages } = buildTailorRequest(jobData, profile);
    expect(system).toContain("resume writer");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("Product Designer");
    expect(messages[0].content).toContain("Widgets Inc");
  });
});

describe("parseTailorResponse", () => {
  it("parses a valid response", () => {
    const raw = JSON.stringify({
      resume: { summary: "Tailored summary", experience: [], skills: ["Figma"] },
      coverLetter: "Dear hiring team,",
    });
    const result = parseTailorResponse(raw);
    expect(result.resume?.summary).toBe("Tailored summary");
    expect(result.coverLetter).toBe("Dear hiring team,");
  });

  it("throws a descriptive error on malformed JSON", () => {
    expect(() => parseTailorResponse("not json")).toThrow(/expected resume\/coverLetter shape/);
  });

  it("throws when required fields are missing", () => {
    expect(() => parseTailorResponse(JSON.stringify({ resume: {} }))).toThrow(/required resume fields/);
  });
});

describe("buildTailoredOutputSchema", () => {
  it("includes only the resume when cover letter is not requested", () => {
    const schema = buildTailoredOutputSchema({ resume: true, coverLetter: false }) as any;
    expect(schema.required).toEqual(["resume"]);
    expect(schema.properties.coverLetter).toBeUndefined();
    expect(schema.properties.resume).toBeDefined();
  });

  it("includes only the cover letter when resume is not requested", () => {
    const schema = buildTailoredOutputSchema({ resume: false, coverLetter: true }) as any;
    expect(schema.required).toEqual(["coverLetter"]);
    expect(schema.properties.resume).toBeUndefined();
  });
});

describe("buildTailorRequest parts", () => {
  it("returns a schema and omits résumé wording when only a cover letter is requested", () => {
    const { system, schema } = buildTailorRequest(jobData, profile, { resume: false, coverLetter: true });
    expect((schema as any).required).toEqual(["coverLetter"]);
    expect(system).toContain("coverLetter");
    expect(system).not.toContain('"resume"');
  });
});

describe("parseTailorResponse parts", () => {
  it("parses a cover-letter-only response without requiring résumé fields", () => {
    const raw = JSON.stringify({ coverLetter: "Dear team," });
    const result = parseTailorResponse(raw, { resume: false, coverLetter: true });
    expect(result.coverLetter).toBe("Dear team,");
    expect(result.resume).toBeUndefined();
  });

  it("throws when a requested cover letter is missing", () => {
    expect(() =>
      parseTailorResponse(JSON.stringify({ resume: { summary: "s", experience: [], skills: [] } }), {
        resume: false,
        coverLetter: true,
      })
    ).toThrow(/cover letter/i);
  });
});

describe("callClaudeApi schema param", () => {
  it("omits output_config when no schema is passed", async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "x" }] }) }));
    vi.stubGlobal("fetch", spy);
    await callClaudeApi("sk-ant-test", "sys", [{ role: "user", content: "hi" }]);
    const body = JSON.parse((spy.mock.calls[0] as any)[1].body);
    expect(body.output_config).toBeUndefined();
  });

  it("includes output_config when a schema is passed", async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "x" }] }) }));
    vi.stubGlobal("fetch", spy);
    await callClaudeApi("sk-ant-test", "sys", [{ role: "user", content: "hi" }], { type: "object" });
    const body = JSON.parse((spy.mock.calls[0] as any)[1].body);
    expect(body.output_config.format.type).toBe("json_schema");
  });
});

describe("callClaudeApi", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "hello" }] }),
      }))
    );
  });

  it("posts to the Anthropic API and returns the text block", async () => {
    const result = await callClaudeApi("sk-ant-test", "system prompt", [
      { role: "user", content: "hi" },
    ]);
    expect(result).toBe("hello");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when the API responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }))
    );
    await expect(callClaudeApi("bad-key", "sys", [])).rejects.toThrow(/Claude API error \(401\)/);
  });

  it("throws a clear error when the response was cut off by the max_tokens limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" }),
      }))
    );
    await expect(
      callClaudeApi("sk-ant-test", "system prompt", [{ role: "user", content: "hi" }])
    ).rejects.toThrow(/cut off/);
  });
});
