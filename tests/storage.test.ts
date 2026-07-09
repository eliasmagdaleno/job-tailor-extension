import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, unknown> = {};

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
  },
}));

import {
  getApiKey,
  setApiKey,
  getMasterProfile,
  setMasterProfile,
  getApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  findApplicationByUrl,
  getGenerationStatus,
  setGenerationStatus,
} from "../src/lib/storage";
import type { ApplicationRecord, GenerationStatus, JobData, MasterProfile } from "../src/lib/types";

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe("storage", () => {
  it("returns null when no API key is set", async () => {
    expect(await getApiKey()).toBeNull();
  });

  it("round-trips an API key", async () => {
    await setApiKey("sk-ant-test");
    expect(await getApiKey()).toBe("sk-ant-test");
  });

  it("returns null when no profile is set, and round-trips one", async () => {
    expect(await getMasterProfile()).toBeNull();
    const profile: MasterProfile = {
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer",
      experience: [],
      education: [],
      skills: ["Figma"],
    };
    await setMasterProfile(profile);
    expect(await getMasterProfile()).toEqual(profile);
  });

  it("starts with an empty applications list", async () => {
    expect(await getApplications()).toEqual([]);
  });

  it("appends, updates, finds, and deletes applications", async () => {
    const record: ApplicationRecord = {
      id: "1",
      dateApplied: "2026-07-07",
      company: "Acme",
      jobTitle: "Engineer",
      site: "Welcome to the Jungle",
      jobUrl: "https://example.com/job/1",
      status: "applied",
    };
    await addApplication(record);
    expect(await getApplications()).toHaveLength(1);

    const found = await findApplicationByUrl("https://example.com/job/1");
    expect(found?.company).toBe("Acme");

    await updateApplication("1", { status: "interviewing" });
    expect((await findApplicationByUrl("https://example.com/job/1"))?.status).toBe("interviewing");

    await deleteApplication("1");
    expect(await getApplications()).toEqual([]);
  });

  const sampleJobData: JobData = {
    title: "Product Designer",
    company: "Acme",
    description: "desc",
    url: "https://example.com/job/1",
    site: "Welcome to the Jungle",
    parsedVia: "structured",
  };

  describe("generation status", () => {
    it("returns null when no generation status is set, and round-trips one", async () => {
      expect(await getGenerationStatus()).toBeNull();
      const status: GenerationStatus = {
        phase: "running",
        jobData: sampleJobData,
        parts: { resume: true, coverLetter: true },
        startedAt: 1234,
      };
      await setGenerationStatus(status);
      expect(await getGenerationStatus()).toEqual(status);
    });

    it("clears the generation status by setting null", async () => {
      await setGenerationStatus({ phase: "cancelled", jobData: sampleJobData, parts: { resume: true, coverLetter: true } });
      await setGenerationStatus(null);
      expect(await getGenerationStatus()).toBeNull();
    });
  });
});
