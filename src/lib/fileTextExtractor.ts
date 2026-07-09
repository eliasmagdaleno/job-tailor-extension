import browser from "webextension-polyfill";

export class ExtractionError extends Error {}

const HEADER_FONT_RATIO = 1.15;
const HEADER_MAX_LENGTH = 80;
const BULLET_PREFIX = /^[•●▪‣*-]\s+/;
const MIN_EXTRACTED_LENGTH = 20;

export interface ExtractedLine {
  text: string;
  fontSize: number;
}

export function linesToMarkdown(lines: ExtractedLine[]): string {
  const nonEmpty = lines
    .map((l) => ({ text: l.text.trim(), fontSize: l.fontSize }))
    .filter((l) => l.text.length > 0);
  if (nonEmpty.length === 0) return "";

  const sortedSizes = nonEmpty.map((l) => l.fontSize).sort((a, b) => a - b);
  const medianSize = sortedSizes[Math.floor((sortedSizes.length - 1) / 2)];

  return nonEmpty
    .map((line) => {
      if (BULLET_PREFIX.test(line.text)) {
        return `- ${line.text.replace(BULLET_PREFIX, "")}`;
      }
      if (
        medianSize > 0 &&
        line.fontSize >= medianSize * HEADER_FONT_RATIO &&
        line.text.length <= HEADER_MAX_LENGTH
      ) {
        return `## ${line.text}`;
      }
      return line.text;
    })
    .join("\n\n");
}

export async function extractDocxMarkdown(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { default: TurndownService } = await import("turndown");

  let html: string;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    html = result.value;
  } catch {
    throw new ExtractionError(
      "This file doesn't look like a valid .docx. If it's a legacy .doc, re-save as .docx, or paste the text into a .txt file."
    );
  }

  const turndownService = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  const markdown = turndownService.turndown(html).trim();

  if (markdown.length < MIN_EXTRACTED_LENGTH) {
    throw new ExtractionError(
      "Couldn't find readable text in this document. Try exporting as .txt/.md, or fill the form manually below."
    );
  }

  return markdown;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  hasEOL: boolean;
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

export async function extractPdfMarkdown(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL("pdf.worker.min.mjs");

  const loadDoc = async () => {
    try {
      return await pdfjsLib.getDocument({ data: buffer }).promise;
    } catch (err) {
      if (err instanceof Error && err.name === "PasswordException") {
        throw new ExtractionError("This PDF is password-protected. Remove the password or export as .txt/.md.");
      }
      throw new ExtractionError("Couldn't read this PDF. Try exporting as .txt/.md, or fill the form manually below.");
    }
  };
  const doc = await loadDoc();

  const lines: ExtractedLine[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let text = "";
    let fontSize = 0;
    for (const item of content.items) {
      if (!isPdfTextItem(item)) continue;
      text += item.str;
      fontSize = Math.max(fontSize, Math.abs(item.transform[3]));
      if (item.hasEOL) {
        lines.push({ text, fontSize });
        text = "";
        fontSize = 0;
      }
    }
    if (text.trim()) lines.push({ text, fontSize });
  }

  const markdown = linesToMarkdown(lines);
  if (markdown.length < MIN_EXTRACTED_LENGTH) {
    throw new ExtractionError(
      "Couldn't find readable text in this PDF — it may be a scanned image. Try exporting as .txt/.md, or fill the form manually below."
    );
  }

  return markdown;
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    return extractPdfMarkdown(await file.arrayBuffer());
  }
  if (name.endsWith(".docx")) {
    return extractDocxMarkdown(await file.arrayBuffer());
  }
  return file.text();
}
