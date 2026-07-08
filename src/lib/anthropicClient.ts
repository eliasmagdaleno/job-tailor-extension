import { safeParseJson } from "./safeParseJson";
import type { JobData, MasterProfile, TailoredOutput } from "./types";

export interface AnthropicMessage {
  role: "user";
  content: string;
}

const MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export function buildTailorRequest(
  jobData: JobData,
  profile: MasterProfile
): { system: string; messages: AnthropicMessage[] } {
  const system =
    "You are an expert resume writer. Given a job listing and a candidate's " +
    "master profile, select and lightly rewrite the most relevant experience " +
    "bullets and write a tailored cover letter. Respond with ONLY valid JSON " +
    'matching this TypeScript type, no markdown fences, no commentary:\n' +
    '{ "resume": { "summary": string, "experience": Array<{ "company": string, ' +
    '"title": string, "dates": string, "bullets": string[] }>, "skills": string[] }, ' +
    '"coverLetter": string }';

  const user = JSON.stringify({
    job: {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location ?? null,
      description: jobData.description,
    },
    candidateProfile: profile,
  });

  return { system, messages: [{ role: "user", content: user }] };
}

export function parseTailorResponse(raw: string): TailoredOutput {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude response did not match the expected resume/coverLetter shape");
  }

  const { resume, coverLetter } = parsed as any;

  if (
    typeof resume?.summary !== "string" ||
    !Array.isArray(resume?.experience) ||
    !Array.isArray(resume?.skills) ||
    typeof coverLetter !== "string"
  ) {
    throw new Error("Claude response was missing required resume fields");
  }

  return { resume, coverLetter };
}

export async function callClaudeApi(
  apiKey: string,
  system: string,
  messages: AnthropicMessage[]
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
    }),
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
