import { describe, it, expect } from "vitest";
import { linesToMarkdown, type ExtractedLine } from "../src/lib/fileTextExtractor";

describe("linesToMarkdown", () => {
  it("returns an empty string for no lines", () => {
    expect(linesToMarkdown([])).toBe("");
  });

  it("marks a short, large-font line as a heading relative to median body size", () => {
    const lines: ExtractedLine[] = [
      { text: "Jane Doe", fontSize: 20 },
      { text: "Software Engineer with five years of experience.", fontSize: 10 },
      { text: "Built and shipped several production systems.", fontSize: 10 },
    ];
    expect(linesToMarkdown(lines)).toBe(
      "## Jane Doe\n\nSoftware Engineer with five years of experience.\n\nBuilt and shipped several production systems."
    );
  });

  it("marks bullet-glyph-prefixed lines as list items", () => {
    const lines: ExtractedLine[] = [
      { text: "• Built scalable APIs", fontSize: 10 },
      { text: "- Led a team of four engineers", fontSize: 10 },
      { text: "* Migrated the billing system", fontSize: 10 },
    ];
    expect(linesToMarkdown(lines)).toBe(
      "- Built scalable APIs\n\n- Led a team of four engineers\n\n- Migrated the billing system"
    );
  });

  it("does not treat a long line as a heading even at a larger font size", () => {
    const lines: ExtractedLine[] = [
      {
        text: "This line is intentionally long enough that it should not be treated as a heading even though",
        fontSize: 20,
      },
      { text: "Body text at the normal size.", fontSize: 10 },
    ];
    const result = linesToMarkdown(lines);
    expect(result).not.toContain("##");
  });

  it("falls back to all-paragraph output when font size is uniform", () => {
    const lines: ExtractedLine[] = [
      { text: "Jane Doe", fontSize: 12 },
      { text: "Software Engineer with five years of experience.", fontSize: 12 },
    ];
    const result = linesToMarkdown(lines);
    expect(result).not.toContain("##");
    expect(result).toBe("Jane Doe\n\nSoftware Engineer with five years of experience.");
  });

  it("ignores blank lines", () => {
    const lines: ExtractedLine[] = [
      { text: "Jane Doe", fontSize: 20 },
      { text: "   ", fontSize: 10 },
      { text: "Software Engineer with five years of experience.", fontSize: 10 },
    ];
    expect(linesToMarkdown(lines)).toBe(
      "## Jane Doe\n\nSoftware Engineer with five years of experience."
    );
  });
});
