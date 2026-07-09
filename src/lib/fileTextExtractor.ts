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
