import { buildTailorRequest, parseTailorResponse, type AnthropicMessage } from "../lib/anthropicClient";
import { buildProfileImportRequest, parseProfileImportResponse } from "../lib/profileImport";
import type { GenerationParts, JobData, MasterProfile, TailoredOutput } from "../lib/types";

export interface GenerateTailoredMessage {
  type: "GENERATE_TAILORED";
  jobData: JobData;
  profile: MasterProfile;
  apiKey: string;
  parts: GenerationParts;
  coverLetterOptions?: { includeReference: boolean; oneOffNote?: string };
}

export interface ImportProfileMessage {
  type: "IMPORT_PROFILE";
  resumeText: string;
  apiKey: string;
}

export type BackgroundMessage = GenerateTailoredMessage | ImportProfileMessage;

export type CallClaudeApiFn = (
  apiKey: string,
  system: string,
  messages: AnthropicMessage[],
  schema?: object
) => Promise<string>;

export async function handleMessage(
  message: BackgroundMessage,
  callClaudeApi: CallClaudeApiFn
): Promise<{ ok: true; data: TailoredOutput | MasterProfile } | { ok: false; error: string }> {
  try {
    if (message.type === "GENERATE_TAILORED") {
      const { system, messages, schema } = buildTailorRequest(
        message.jobData,
        message.profile,
        message.parts,
        message.coverLetterOptions
      );
      const raw = await callClaudeApi(message.apiKey, system, messages, schema);
      return { ok: true, data: parseTailorResponse(raw, message.parts) };
    }
    if (message.type === "IMPORT_PROFILE") {
      const { system, messages } = buildProfileImportRequest(message.resumeText);
      // No schema: profile import must NOT be constrained to the résumé shape.
      const raw = await callClaudeApi(message.apiKey, system, messages, undefined);
      return { ok: true, data: parseProfileImportResponse(raw) };
    }
    return { ok: false, error: `Unknown message type: ${(message as { type: string }).type}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
