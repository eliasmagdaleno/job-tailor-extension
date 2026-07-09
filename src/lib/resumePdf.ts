import { jsPDF } from "jspdf";
import type { MasterProfile, TailoredOutput } from "./types";

export type ResumeContent = NonNullable<TailoredOutput["resume"]>;

const MIDDOT = "  ·  ";

/** Contact line: email · phone · location · linkedin · portfolio, present fields only. */
export function buildContactLine(contact: MasterProfile["contact"]): string {
  return [contact.email, contact.phone, contact.location, contact.linkedinUrl, contact.portfolioUrl]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(MIDDOT);
}

const ACCENT: [number, number, number] = [30, 41, 82]; // restrained navy
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [90, 90, 90];

export function downloadResumePdf(
  resume: ResumeContent,
  profile: MasterProfile,
  filename: string
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54; // 0.75in
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (label: string) => {
    ensureSpace(30);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + contentW, y);
    y += 13;
  };

  const paragraph = (text: string, size = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    for (const line of doc.splitTextToSize(text, contentW) as string[]) {
      ensureSpace(size + 3);
      doc.text(line, margin, y);
      y += size + 3;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(profile.contact.name, margin, y);
  y += 22;

  const contactLine = buildContactLine(profile.contact);
  if (contactLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(contactLine, margin, y);
    y += 14;
  }

  // Summary
  if (resume.summary.trim()) {
    heading("Summary");
    paragraph(resume.summary);
  }

  // Experience
  if (resume.experience.length) {
    heading("Experience");
    for (const job of resume.experience) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(`${job.title} — ${job.company}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(job.dates, margin + contentW, y, { align: "right" });
      y += 14;

      doc.setFontSize(10);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      const bulletIndent = 12;
      for (const bullet of job.bullets) {
        const lines = doc.splitTextToSize(bullet, contentW - bulletIndent) as string[];
        lines.forEach((line, i) => {
          ensureSpace(13);
          if (i === 0) doc.text("•", margin, y);
          doc.text(line, margin + bulletIndent, y);
          y += 13;
        });
      }
      y += 6;
    }
  }

  // Skills
  if (resume.skills.length) {
    heading("Skills");
    paragraph(resume.skills.join(",  "));
  }

  // Education (static, from the profile)
  if (profile.education.length) {
    heading("Education");
    for (const edu of profile.education) {
      ensureSpace(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(edu.school, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      if (edu.gradDate) doc.text(edu.gradDate, margin + contentW, y, { align: "right" });
      y += 13;
      const detail = [edu.degree, edu.field].filter(Boolean).join(", ");
      if (detail) {
        doc.setFontSize(10);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(detail, margin, y);
        y += 14;
      }
      y += 4;
    }
  }

  doc.save(filename);
}
