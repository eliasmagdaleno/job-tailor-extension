import { describe, it, expect } from "vitest";
import { buildContactLine } from "../src/lib/resumePdf";

describe("buildContactLine", () => {
  it("joins only the present contact fields with a middot", () => {
    const line = buildContactLine({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      location: "",
      linkedinUrl: "linkedin.com/in/jane",
    });
    expect(line).toContain("jane@example.com");
    expect(line).toContain("555-1234");
    expect(line).toContain("linkedin.com/in/jane");
    // empty location is dropped, no trailing/duplicate separators
    expect(line).not.toMatch(/·\s*·/);
  });

  it("returns an empty string when only the name is present", () => {
    expect(buildContactLine({ name: "Jane Doe", email: "" })).toBe("");
  });
});
