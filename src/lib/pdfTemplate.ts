import html2pdf from "html2pdf.js";
import type { MasterProfile, TailoredOutput } from "./types";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderResumeHtml(output: TailoredOutput, contact: MasterProfile["contact"]): string {
  const experienceHtml = output.resume.experience
    .map(
      (job) => `
        <section class="job">
          <h3>${escapeHtml(job.title)} — ${escapeHtml(job.company)}</h3>
          <p class="dates">${escapeHtml(job.dates)}</p>
          <ul>${job.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        </section>`
    )
    .join("");

  const contactLine = [contact.email, contact.phone, contact.location]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(" · ");

  return `
    <div class="resume">
      <header>
        <h1>${escapeHtml(contact.name)}</h1>
        <p>${contactLine}</p>
      </header>
      <p class="summary">${escapeHtml(output.resume.summary)}</p>
      ${experienceHtml}
      <section class="skills">
        <h3>Skills</h3>
        <p>${output.resume.skills.map(escapeHtml).join(", ")}</p>
      </section>
    </div>`;
}

export function renderCoverLetterHtml(output: TailoredOutput, contact: MasterProfile["contact"]): string {
  const paragraphs = output.coverLetter
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("");

  const contactLine = [contact.email, contact.phone]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(" · ");

  return `
    <div class="cover-letter">
      <header>
        <h1>${escapeHtml(contact.name)}</h1>
        <p>${contactLine}</p>
      </header>
      ${paragraphs}
    </div>`;
}

export async function downloadPdf(html: string, filename: string): Promise<void> {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "720px";
  container.style.padding = "32px";
  container.style.fontFamily = "Helvetica, Arial, sans-serif";
  document.body.appendChild(container);
  try {
    await html2pdf().from(container).set({ filename, margin: 0.5 }).save();
  } finally {
    document.body.removeChild(container);
  }
}
