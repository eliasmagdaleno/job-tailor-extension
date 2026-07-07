import type { JobData } from "../lib/types";

type PartialJobData = Omit<JobData, "url" | "site" | "parsedVia">;

export function parseJobFromPage(doc: Document, url: string): JobData | null {
  const structured = parseFromJsonLd(doc);
  if (structured) {
    return { ...structured, url, site: "Welcome to the Jungle", parsedVia: "structured" };
  }
  const fallback = parseFromFallbackHeuristics(doc);
  if (fallback) {
    return { ...fallback, url, site: "Welcome to the Jungle", parsedVia: "fallback" };
  }
  return null;
}

function parseFromJsonLd(doc: Document): PartialJobData | null {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;

    const title = typeof posting.title === "string" ? posting.title : null;
    const company =
      typeof posting.hiringOrganization?.name === "string" ? posting.hiringOrganization.name : null;
    const description =
      typeof posting.description === "string" ? stripHtml(doc, posting.description) : null;

    if (title && company && description) {
      return { title, company, description, location: extractLocation(posting.jobLocation) };
    }
  }
  return null;
}

function findJobPosting(data: unknown): Record<string, any> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return data.find((n) => (n as Record<string, unknown>)?.["@type"] === "JobPosting") ?? null;
  }
  const obj = data as Record<string, unknown>;
  if (obj["@type"] === "JobPosting") return obj;
  if (Array.isArray(obj["@graph"])) {
    return (obj["@graph"] as unknown[]).find(
      (n) => (n as Record<string, unknown>)?.["@type"] === "JobPosting"
    ) as Record<string, any> | null;
  }
  return null;
}

function extractLocation(jobLocation: unknown): string | undefined {
  if (!jobLocation) return undefined;
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  const address = (loc as Record<string, any>)?.address;
  if (typeof address === "string") return address;
  const city = address?.addressLocality;
  const country = address?.addressCountry;
  return [city, country].filter(Boolean).join(", ") || undefined;
}

function stripHtml(doc: Document, html: string): string {
  const tmp = doc.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parseFromFallbackHeuristics(doc: Document): PartialJobData | null {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
  const title = ogTitle ?? (doc.title || null);
  const main = doc.querySelector("main");
  const description = main?.textContent?.replace(/\s+/g, " ").trim();

  if (!title || !description || description.length < 40) return null;

  return { title, company: ogSiteName ?? "Unknown company", description };
}
