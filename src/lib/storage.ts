import browser from "webextension-polyfill";
import type { ApplicationRecord, MasterProfile } from "./types";

const KEYS = {
  apiKey: "anthropicApiKey",
  profile: "masterProfile",
  applications: "applications",
} as const;

export async function getApiKey(): Promise<string | null> {
  const result = await browser.storage.local.get(KEYS.apiKey);
  return (result[KEYS.apiKey] as string | undefined) ?? null;
}

export async function setApiKey(apiKey: string): Promise<void> {
  await browser.storage.local.set({ [KEYS.apiKey]: apiKey });
}

export async function getMasterProfile(): Promise<MasterProfile | null> {
  const result = await browser.storage.local.get(KEYS.profile);
  return (result[KEYS.profile] as MasterProfile | undefined) ?? null;
}

export async function setMasterProfile(profile: MasterProfile): Promise<void> {
  await browser.storage.local.set({ [KEYS.profile]: profile });
}

export async function getApplications(): Promise<ApplicationRecord[]> {
  const result = await browser.storage.local.get(KEYS.applications);
  return (result[KEYS.applications] as ApplicationRecord[] | undefined) ?? [];
}

export async function addApplication(record: ApplicationRecord): Promise<void> {
  const existing = await getApplications();
  await browser.storage.local.set({ [KEYS.applications]: [...existing, record] });
}

export async function updateApplication(
  id: string,
  updates: Partial<ApplicationRecord>
): Promise<void> {
  const existing = await getApplications();
  const next = existing.map((r) => (r.id === id ? { ...r, ...updates } : r));
  await browser.storage.local.set({ [KEYS.applications]: next });
}

export async function deleteApplication(id: string): Promise<void> {
  const existing = await getApplications();
  await browser.storage.local.set({
    [KEYS.applications]: existing.filter((r) => r.id !== id),
  });
}

export async function findApplicationByUrl(jobUrl: string): Promise<ApplicationRecord | null> {
  const existing = await getApplications();
  return existing.find((r) => r.jobUrl === jobUrl) ?? null;
}
