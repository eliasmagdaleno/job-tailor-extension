import { buildTailorRequest, parseTailorResponse, type AnthropicMessage } from "../lib/anthropicClient";
import { buildProfileImportRequest, parseProfileImportResponse } from "../lib/profileImport";
import type { JobData, MasterProfile, TailoredOutput } from "../lib/types";

export interface GenerateTailoredMessage {
  type: "GENERATE_TAILORED";
  jobData: JobData;
  profile: MasterProfile;
  apiKey: string;
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
  messages: AnthropicMessage[]
) => Promise<string>;

export async function handleMessage(
  message: BackgroundMessage,
  callClaudeApi: CallClaudeApiFn
): Promise<{ ok: true; data: TailoredOutput | MasterProfile } | { ok: false; error: string }> {
  try {
    if (message.type === "GENERATE_TAILORED") {
      const { system, messages } = buildTailorRequest(message.jobData, message.profile);
      const raw = await callClaudeApi(message.apiKey, system, messages);
      return { ok: true, data: parseTailorResponse(raw) };
    }
    if (message.type === "IMPORT_PROFILE") {
      const { system, messages } = buildProfileImportRequest(message.resumeText);
      const raw = await callClaudeApi(message.apiKey, system, messages);
      return { ok: true, data: parseProfileImportResponse(raw) };
    }
    return { ok: false, error: `Unknown message type: ${(message as { type: string }).type}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
