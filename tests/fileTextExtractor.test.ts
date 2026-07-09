import { describe, it, expect, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      getURL: vi.fn((path: string) => path),
    },
  },
}));

import * as mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";
import {
  linesToMarkdown,
  extractDocxMarkdown,
  extractPdfMarkdown,
  extractText,
  ExtractionError,
  type ExtractedLine,
} from "../src/lib/fileTextExtractor";

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

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
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

interface FakePdfTextItem {
  str: string;
  fontSize: number;
  hasEOL: boolean;
}

function makeFakePdfDoc(pages: FakePdfTextItem[][]) {
  return {
    numPages: pages.length,
    getPage: (pageNum: number) =>
      Promise.resolve({
        getTextContent: () =>
          Promise.resolve({
            items: pages[pageNum - 1].map((item) => ({
              str: item.str,
              transform: [item.fontSize, 0, 0, item.fontSize, 0, 0],
              hasEOL: item.hasEOL,
            })),
          }),
      }),
  };
}

describe("extractPdfMarkdown", () => {
  it("groups text items into lines (on hasEOL) and runs them through linesToMarkdown", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve(
        makeFakePdfDoc([
          [
            { str: "Jane Doe", fontSize: 20, hasEOL: true },
            { str: "Software Engineer with five years of experience.", fontSize: 10, hasEOL: true },
            { str: "• Built scalable APIs", fontSize: 10, hasEOL: true },
          ],
        ])
      ),
    } as ReturnType<typeof pdfjs.getDocument>);

    const result = await extractPdfMarkdown(new ArrayBuffer(8));

    expect(result).toBe(
      "## Jane Doe\n\nSoftware Engineer with five years of experience.\n\n- Built scalable APIs"
    );
  });

  it("joins text items across multiple pages", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve(
        makeFakePdfDoc([
          [{ str: "Jane Doe, a software engineer with five years of experience.", fontSize: 10, hasEOL: true }],
          [{ str: "References available on request from prior employers.", fontSize: 10, hasEOL: true }],
        ])
      ),
    } as ReturnType<typeof pdfjs.getDocument>);

    const result = await extractPdfMarkdown(new ArrayBuffer(8));

    expect(result).toContain("Jane Doe, a software engineer");
    expect(result).toContain("References available on request");
  });

  it("maps a password-protected PDF to a friendly ExtractionError", async () => {
    const passwordError = new Error("No password given");
    passwordError.name = "PasswordException";
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.reject(passwordError),
    } as ReturnType<typeof pdfjs.getDocument>);

    await expect(extractPdfMarkdown(new ArrayBuffer(8))).rejects.toThrow(/password-protected/i);
  });

  it("maps any other pdf.js load failure to a generic ExtractionError", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.reject(new Error("Invalid PDF structure")),
    } as ReturnType<typeof pdfjs.getDocument>);

    await expect(extractPdfMarkdown(new ArrayBuffer(8))).rejects.toThrow(ExtractionError);
  });

  it("throws ExtractionError when the PDF has no extractable text (e.g. scanned image)", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve(makeFakePdfDoc([[]])),
    } as ReturnType<typeof pdfjs.getDocument>);

    await expect(extractPdfMarkdown(new ArrayBuffer(8))).rejects.toThrow(/scanned image/i);
  });
});

describe("extractText", () => {
  it("routes .txt/.md files through file.text(), unchanged", async () => {
    const file = new File(["plain resume text"], "resume.txt", { type: "text/plain" });
    file.text = vi.fn().mockResolvedValue("plain resume text");

    await expect(extractText(file)).resolves.toBe("plain resume text");
  });

  it("routes .docx files through extractDocxMarkdown", async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: "<p>Jane Doe, a software engineer with five years of experience.</p>",
      messages: [],
    });
    const file = new File([], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));

    await expect(extractText(file)).resolves.toContain("Jane Doe");
  });

  it("routes .pdf files through extractPdfMarkdown", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve(
        makeFakePdfDoc([[{ str: "Jane Doe, a software engineer with five years of experience.", fontSize: 10, hasEOL: true }]])
      ),
    } as ReturnType<typeof pdfjs.getDocument>);
    const file = new File([], "resume.pdf", { type: "application/pdf" });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));

    await expect(extractText(file)).resolves.toContain("Jane Doe");
  });

  it("routes an uppercase .PDF extension through extractPdfMarkdown", async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve(
        makeFakePdfDoc([[{ str: "Jane Doe, a software engineer with five years of experience.", fontSize: 10, hasEOL: true }]])
      ),
    } as ReturnType<typeof pdfjs.getDocument>);
    const file = new File([], "RESUME.PDF", { type: "application/pdf" });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));

    await expect(extractText(file)).resolves.toContain("Jane Doe");
  });
});
