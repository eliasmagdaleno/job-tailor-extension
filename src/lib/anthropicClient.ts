import { safeParseJson } from "./safeParseJson";
import type { GenerationParts, JobData, MasterProfile, TailoredOutput } from "./types";

export interface AnthropicMessage {
  role: "user";
  content: string;
}

const MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

// Résumé sub-schema (structured outputs: every object needs
// additionalProperties:false + required). Structured outputs constrain Claude
// to emit valid, parseable JSON of exactly this shape — the root-cause fix for
// "Claude response did not match the expected resume/coverLetter shape".
const RESUME_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          dates: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "dates", "bullets"],
        additionalProperties: false,
      },
    },
    skills: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "experience", "skills"],
  additionalProperties: false,
} as const;

const BOTH: GenerationParts = { resume: true, coverLetter: true };

export function buildTailoredOutputSchema(parts: GenerationParts) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (parts.resume) {
    properties.resume = RESUME_SCHEMA;
    required.push("resume");
  }
  if (parts.coverLetter) {
    properties.coverLetter = { type: "string" };
    required.push("coverLetter");
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export function buildTailorRequest(
  jobData: JobData,
  profile: MasterProfile,
  parts: GenerationParts = BOTH,
  coverLetterOptions?: { includeReference?: boolean; oneOffNote?: string }
): { system: string; messages: AnthropicMessage[]; schema: object } {
  const wants: string[] = [];
  if (parts.resume) {
    wants.push(
      '"resume": { "summary": string, "experience": Array<{ "company": string, ' +
        '"title": string, "dates": string, "bullets": string[] }>, "skills": string[] }'
    );
  }
  if (parts.coverLetter) wants.push('"coverLetter": string');

  let system =
    "You are an expert resume writer. Given a job listing and a candidate's " +
    "master profile, select and lightly rewrite the most relevant experience " +
    "bullets" +
    (parts.coverLetter ? " and write a tailored cover letter" : "") +
    ". Respond with ONLY valid JSON matching this TypeScript type, no markdown " +
    "fences, no commentary:\n{ " +
    wants.join(", ") +
    " }";

  const candidateProfile: Record<string, unknown> = {
    contact: profile.contact,
    summary: profile.summary,
    experience: profile.experience,
    education: profile.education,
    skills: profile.skills,
  };

  const includeReference = Boolean(coverLetterOptions?.includeReference && profile.coverLetterReference);

  if (parts.coverLetter) {
    if (profile.coverLetterStyle?.preset) {
      system += ` Write the cover letter in a ${profile.coverLetterStyle.preset} tone.`;
      if (profile.coverLetterStyle.customNotes) {
        system += ` ${profile.coverLetterStyle.customNotes}`;
      }
    }
    if (includeReference) {
      system +=
        " Study the writing style, sentence rhythm, and word choice of the reference " +
        "cover letter provided (referenceCoverLetter) and emulate that voice — do not " +
        "copy its content verbatim.";
    }
    if (profile.snippets?.length) candidateProfile.snippets = profile.snippets;
    if (coverLetterOptions?.oneOffNote?.trim()) {
      candidateProfile.jobSpecificNote = coverLetterOptions.oneOffNote.trim();
    }
    if (candidateProfile.snippets || candidateProfile.jobSpecificNote) {
      system +=
        " Naturally incorporate relevant details from the candidate's snippets/" +
        "jobSpecificNote where appropriate, without forcing all of them in.";
    }
    if (includeReference) {
      candidateProfile.referenceCoverLetter = profile.coverLetterReference;
    }
  }

  const user = JSON.stringify({
    job: {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location ?? null,
      description: jobData.description,
    },
    candidateProfile,
  });

  return { system, messages: [{ role: "user", content: user }], schema: buildTailoredOutputSchema(parts) };
}

export function parseTailorResponse(raw: string, parts: GenerationParts = BOTH): TailoredOutput {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    // Include a bounded preview of what actually came back so a parse failure
    // is diagnosable instead of opaque. Keep the "expected resume/coverLetter
    // shape" phrasing — callers and tests key off it.
    const preview = raw.trim().slice(0, 300) || "(empty response)";
    throw new Error(
      "Claude response did not match the expected resume/coverLetter shape " +
        `(could not parse as JSON). Response began: ${preview}`
    );
  }

  const { resume, coverLetter } = parsed as any;
  const out: TailoredOutput = {};

  if (parts.resume) {
    if (
      typeof resume?.summary !== "string" ||
      !Array.isArray(resume?.experience) ||
      !Array.isArray(resume?.skills)
    ) {
      throw new Error("Claude response was missing required resume fields");
    }
    out.resume = resume;
  }

  if (parts.coverLetter) {
    if (typeof coverLetter !== "string") {
      throw new Error("Claude response was missing the cover letter");
    }
    out.coverLetter = coverLetter;
  }

  return out;
}

export async function callClaudeApi(
  apiKey: string,
  system: string,
  messages: AnthropicMessage[],
  schema?: object,
  signal?: AbortSignal
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 16000,
    system,
    messages,
  };
  if (schema) {
    body.output_config = { format: { type: "json_schema", schema } };
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };

  if (data.stop_reason === "max_tokens") {
    throw new Error("Claude's response was cut off before completing (output limit reached). Try again.");
  }

  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude API response contained no text content");
  }
  return textBlock.text;
}
