import { buildTailorRequest, parseTailorResponse, type AnthropicMessage } from "../lib/anthropicClient";
import { buildProfileImportRequest, parseProfileImportResponse } from "../lib/profileImport";
import type { GenerationParts, GenerationStatus, JobData, MasterProfile, TailoredOutput } from "../lib/types";

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

export interface CancelGenerationMessage {
  type: "CANCEL_GENERATION";
}

export type BackgroundMessage = GenerateTailoredMessage | ImportProfileMessage | CancelGenerationMessage;

export type CallClaudeApiFn = (
  apiKey: string,
  system: string,
  messages: AnthropicMessage[],
  schema?: object,
  signal?: AbortSignal
) => Promise<string>;

export type SetGenerationStatusFn = (status: GenerationStatus) => Promise<void>;

const noopSetGenerationStatus: SetGenerationStatusFn = async () => {};

// Module-level: only one generation is realistic at a time (the popup only
// ever drives a single job), so a single slot is enough — no per-job IDs.
let currentAbortController: AbortController | null = null;

export async function handleMessage(
  message: BackgroundMessage,
  callClaudeApi: CallClaudeApiFn,
  setGenerationStatus: SetGenerationStatusFn = noopSetGenerationStatus
): Promise<{ ok: true; data?: TailoredOutput | MasterProfile } | { ok: false; error: string }> {
  if (message.type === "CANCEL_GENERATION") {
    currentAbortController?.abort();
    return { ok: true };
  }

  try {
    if (message.type === "GENERATE_TAILORED") {
      const controller = new AbortController();
      currentAbortController = controller;
      try {
        await setGenerationStatus({
          phase: "running",
          jobData: message.jobData,
          parts: message.parts,
          startedAt: Date.now(),
        });
        const { system, messages, schema } = buildTailorRequest(
          message.jobData,
          message.profile,
          message.parts,
          message.coverLetterOptions
        );
        const raw = await callClaudeApi(message.apiKey, system, messages, schema, controller.signal);
        const data = parseTailorResponse(raw, message.parts);
        await setGenerationStatus({
          phase: "done",
          jobData: message.jobData,
          parts: message.parts,
          output: data,
        });
        return { ok: true, data };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          await setGenerationStatus({ phase: "cancelled", jobData: message.jobData, parts: message.parts });
          return { ok: false, error: "cancelled" };
        }
        const errorMessage = err instanceof Error ? err.message : String(err);
        await setGenerationStatus({
          phase: "error",
          jobData: message.jobData,
          parts: message.parts,
          message: errorMessage,
        });
        return { ok: false, error: errorMessage };
      } finally {
        currentAbortController = null;
      }
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
