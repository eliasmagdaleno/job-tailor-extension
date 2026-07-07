import { describe, it, expect } from "vitest";
import { buildProfileImportRequest, parseProfileImportResponse } from "../src/lib/profileImport";

describe("buildProfileImportRequest", () => {
  it("passes the raw resume text as the user message", () => {
    const { system, messages } = buildProfileImportRequest("Jane Doe\nSenior Designer at Widgets Inc");
    expect(system).toContain("structured JSON");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("Jane Doe");
  });
});

describe("parseProfileImportResponse", () => {
  it("parses a valid profile", () => {
    const raw = JSON.stringify({
      contact: { name: "Jane Doe", email: "jane@example.com" },
      summary: "Product designer",
      experience: [],
      education: [],
      skills: ["Figma"],
    });
    const result = parseProfileImportResponse(raw);
    expect(result.contact.name).toBe("Jane Doe");
  });

  it("throws when contact info is missing", () => {
    expect(() =>
      parseProfileImportResponse(JSON.stringify({ experience: [], education: [], skills: [] }))
    ).toThrow(/expected profile shape/);
  });

  it("throws when required arrays are missing", () => {
    expect(() =>
      parseProfileImportResponse(
        JSON.stringify({ contact: { name: "Jane", email: "j@example.com" }, experience: [] })
      )
    ).toThrow(/required profile fields/);
  });

  it("throws when summary is missing", () => {
    expect(() =>
      parseProfileImportResponse(
        JSON.stringify({
          contact: { name: "Jane", email: "j@example.com" },
          experience: [],
          education: [],
          skills: [],
        })
      )
    ).toThrow(/required profile fields/);
  });
});
