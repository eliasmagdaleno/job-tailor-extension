import { describe, it, expect } from "vitest";
import { escapeHtml, renderCoverLetterHtml } from "../src/lib/pdfTemplate";
import type { MasterProfile, TailoredOutput } from "../src/lib/types";

const contact: MasterProfile["contact"] = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
};

const output: TailoredOutput = {
  resume: {
    summary: "Product designer focused on conversion.",
    experience: [
      {
        company: "Widgets Inc",
        title: "Senior Designer",
        dates: "2021 - Present",
        bullets: ["Led redesign of checkout flow"],
      },
    ],
    skills: ["Figma", "User Research"],
  },
  coverLetter: "Dear hiring team,\n\nI'm excited to apply.",
};

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });
});

describe("renderCoverLetterHtml", () => {
  it("splits the letter into paragraphs", () => {
    const html = renderCoverLetterHtml(output, contact);
    expect(html).toContain("Dear hiring team,");
    expect(html).toContain("I'm excited to apply.");
    expect((html.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
