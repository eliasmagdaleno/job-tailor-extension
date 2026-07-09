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
  // html2pdf clones the element it's handed into an internal measuring wrapper
  // and sizes the render canvas to that wrapper's height. If the element we
  // pass carries `position: absolute`/`fixed`, the clone is out of normal flow,
  // the wrapper collapses to zero height, and html2pdf embeds no image — a
  // blank PDF. So the element passed to html2pdf (`content`) MUST stay in
  // normal flow. To keep it hidden from the user, we nest it inside an
  // off-screen `wrapper`; only the wrapper is positioned, not the content.
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";

  const content = document.createElement("div");
  content.innerHTML = html;
  content.style.width = "720px";
  content.style.padding = "32px";
  content.style.background = "#ffffff";
  content.style.color = "#000000";
  content.style.fontFamily = "Helvetica, Arial, sans-serif";

  wrapper.appendChild(content);
  document.body.appendChild(wrapper);
  try {
    await html2pdf()
      .from(content)
      .set({
        filename,
        margin: 0.5,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      })
      .save();
  } finally {
    document.body.removeChild(wrapper);
  }
}
