import { describe, it, expect, vi } from "vitest";
import * as mammoth from "mammoth";
import { linesToMarkdown, extractDocxMarkdown, ExtractionError, type ExtractedLine } from "../src/lib/fileTextExtractor";

vi.mock("mammoth", () => ({
  convertToHtml: vi.fn(),
}));

vi.mock("turndown", () => ({
  default: vi.fn().mockImplementation(() => ({
    turndown: vi.fn((html: string) =>
      html
        .replace(/<[^>]+>/g, "\n")
        .replace(/\n+/g, "\n")
        .trim()
    ),
  })),
}));

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

describe("extractDocxMarkdown", () => {
  it("converts docx HTML (from mammoth) to text via turndown", async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: "<h1>Jane Doe</h1><p>Software engineer with five years of experience.</p>",
      messages: [],
    });

    const result = await extractDocxMarkdown(new ArrayBuffer(8));

    expect(result).toContain("Jane Doe");
    expect(result).toContain("Software engineer with five years of experience.");
  });

  it("throws ExtractionError when mammoth cannot parse the file", async () => {
    vi.mocked(mammoth.convertToHtml).mockRejectedValue(new Error("not a valid zip file"));

    await expect(extractDocxMarkdown(new ArrayBuffer(8))).rejects.toThrow(ExtractionError);
    await expect(extractDocxMarkdown(new ArrayBuffer(8))).rejects.toThrow(/valid \.docx/);
  });

  it("throws ExtractionError when the docx has no readable text", async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({ value: "<p></p>", messages: [] });

    await expect(extractDocxMarkdown(new ArrayBuffer(8))).rejects.toThrow(/couldn't find readable text/i);
  });
});
