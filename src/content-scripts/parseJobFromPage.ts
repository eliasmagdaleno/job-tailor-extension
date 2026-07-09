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

/**
 * Some Welcome to the Jungle surfaces — notably the Otta app at
 * app.welcometothejungle.com — server-render a `JobPosting` JSON-LD block but
 * strip it from the live DOM once React/react-helmet hydrates, so reading the
 * live document finds nothing. When the in-page parse comes up empty, re-fetch
 * the page URL: the server response still contains the JSON-LD, and it's the
 * same schema `parseJobFromPage` already handles.
 *
 * The re-fetch MUST omit credentials. The Otta app only server-renders the
 * full page (with JSON-LD) for anonymous/crawler requests; a logged-in request
 * gets a bare SPA shell with no structured data. Sending cookies would defeat
 * the whole fallback. The anonymous response is the same public job listing.
 *
 * `fetchHtml`/`parseHtml` are injectable for testing.
 */
export async function parseJobFromPageOrFetch(
  doc: Document,
  url: string,
  deps: {
    fetchHtml?: (url: string) => Promise<string>;
    parseHtml?: (html: string) => Document;
  } = {}
): Promise<JobData | null> {
  const direct = parseJobFromPage(doc, url);
  if (direct) return direct;

  const fetchHtml =
    deps.fetchHtml ?? ((u) => fetch(u, { credentials: "omit" }).then((r) => r.text()));
  const parseHtml =
    deps.parseHtml ?? ((html) => new DOMParser().parseFromString(html, "text/html"));

  try {
    const html = await fetchHtml(url);
    return parseJobFromPage(parseHtml(html), url);
  } catch {
    return null;
  }
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

    const title = typeof posting.title === "string" ? posting.title.trim() : null;
    const company =
      typeof posting.hiringOrganization?.name === "string"
        ? posting.hiringOrganization.name.trim()
        : null;
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
  const title = ogTitle ?? (doc.title || null);
  const main = doc.querySelector("main");
  const description = main?.textContent?.replace(/\s+/g, " ").trim();

  if (!title || !description || description.length < 40) return null;

  // og:site_name is the job board (e.g. "Welcome to the Jungle"), never the
  // employer, so it must never be used as the company. Derive the company
  // from the "<title> at <company>" pattern instead.
  const companyMatch = title.match(/\bat\s+(.+)$/);
  const company = companyMatch ? companyMatch[1].trim() : "Unknown company";

  return { title, company, description };
}
