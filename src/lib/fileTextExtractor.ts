export class ExtractionError extends Error {}

const HEADER_FONT_RATIO = 1.15;
const HEADER_MAX_LENGTH = 80;
const BULLET_PREFIX = /^[•●▪‣*-]\s+/;

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
