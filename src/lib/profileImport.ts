import { safeParseJson } from "./safeParseJson";
import type { AnthropicMessage } from "./anthropicClient";
import type { MasterProfile } from "./types";

export function buildProfileImportRequest(
  resumeText: string
): { system: string; messages: AnthropicMessage[] } {
  const system =
    "You convert raw resume text into structured JSON. Respond with ONLY valid " +
    'JSON matching this TypeScript type, no markdown fences, no commentary:\n' +
    '{ "contact": { "name": string, "email": string, "phone"?: string, ' +
    '"location"?: string, "linkedinUrl"?: string, "portfolioUrl"?: string }, ' +
    '"summary": string, "experience": Array<{ "company": string, "title": string, ' +
    '"startDate": string, "endDate": string, "bullets": string[] }>, ' +
    '"education": Array<{ "school": string, "degree": string, "field": string, ' +
    '"gradDate": string }>, "skills": string[] }';

  return { system, messages: [{ role: "user", content: resumeText }] };
}

export function parseProfileImportResponse(raw: string): MasterProfile {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object" || !("contact" in parsed) || !("experience" in parsed)) {
    throw new Error("Claude response did not match the expected profile shape");
  }
  const profile = parsed as MasterProfile;
  if (
    typeof profile.contact?.name !== "string" ||
    typeof profile.contact?.email !== "string" ||
    !Array.isArray(profile.experience) ||
    !Array.isArray(profile.education) ||
    !Array.isArray(profile.skills)
  ) {
    throw new Error("Claude response was missing required profile fields");
  }
  return profile;
}
