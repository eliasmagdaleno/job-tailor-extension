import { describe, it, expect, vi } from "vitest";
import { parseJobFromPage, parseJobFromPageOrFetch } from "../src/content-scripts/parseJobFromPage";

function makeDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = bodyHtml;
  return doc;
}

describe("parseJobFromPage", () => {
  it("parses JobPosting JSON-LD when present", () => {
    const doc = makeDoc(`
      <script type="application/ld+json">
        ${JSON.stringify({
          "@type": "JobPosting",
          title: "Product Designer",
          hiringOrganization: { name: "Acme" },
          description: "<p>Design end-to-end product experiences.</p>",
          jobLocation: { address: { addressLocality: "Paris", addressCountry: "FR" } },
        })}
      </script>
    `);
    const result = parseJobFromPage(doc, "https://www.welcome-to-the-jungle.com/en/companies/acme/jobs/1");
    expect(result).toMatchObject({
      title: "Product Designer",
      company: "Acme",
      description: "Design end-to-end product experiences.",
      location: "Paris, FR",
      site: "Welcome to the Jungle",
      parsedVia: "structured",
    });
  });

  it("falls back to meta tags and main content when no JSON-LD is present", () => {
    const doc = makeDoc(`
      <meta property="og:title" content="Product Designer at Acme" />
      <meta property="og:site_name" content="Acme" />
      <main>${"Design end-to-end product experiences. ".repeat(5)}</main>
    `);
    const result = parseJobFromPage(doc, "https://www.welcome-to-the-jungle.com/en/companies/acme/jobs/1");
    expect(result?.parsedVia).toBe("fallback");
    expect(result?.title).toBe("Product Designer at Acme");
    expect(result?.company).toBe("Acme");
  });

  it("does not use og:site_name as the company when the title has no 'at X' suffix", () => {
    const doc = makeDoc(`
      <meta property="og:title" content="Product Designer" />
      <meta property="og:site_name" content="Welcome to the Jungle" />
      <main>${"Design end-to-end product experiences. ".repeat(5)}</main>
    `);
    const result = parseJobFromPage(doc, "https://www.welcome-to-the-jungle.com/en/companies/acme/jobs/1");
    expect(result?.parsedVia).toBe("fallback");
    expect(result?.company).toBe("Unknown company");
  });

  it("returns null when neither strategy finds enough content", () => {
    const doc = makeDoc("<p>nothing useful here</p>");
    expect(parseJobFromPage(doc, "https://example.com")).toBeNull();
  });
});

describe("parseJobFromPageOrFetch", () => {
  const jobUrl = "https://app.welcometothejungle.com/jobs/dnFvUDdq";

  it("uses the live-DOM result and does not fetch when JSON-LD is present", async () => {
    const doc = makeDoc(`
      <script type="application/ld+json">
        ${JSON.stringify({
          "@type": "JobPosting",
          title: "Product Designer",
          hiringOrganization: { name: "Acme" },
          description: "<p>Design end-to-end product experiences.</p>",
        })}
      </script>
    `);
    let fetched = false;
    const result = await parseJobFromPageOrFetch(doc, jobUrl, {
      fetchHtml: async () => {
        fetched = true;
        return "";
      },
    });
    expect(fetched).toBe(false);
    expect(result).toMatchObject({ title: "Product Designer", company: "Acme", parsedVia: "structured" });
  });

  it("re-fetches the server-rendered HTML when the live DOM has no JSON-LD (Otta app case)", async () => {
    // The Otta app strips its server-rendered JSON-LD after hydration, so the
    // live document is empty; the SSR response still contains the JobPosting.
    const liveDoc = makeDoc("<div>hydrated app shell, no structured data</div>");
    const ssrHtml = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        title: "Fullstack Software Engineer ",
        hiringOrganization: { name: "Glean" },
        description: "<h1>Requirements</h1><ul><li>BA/BS in computer science</li></ul>",
        jobLocation: [{ address: { addressLocality: "San Francisco Bay Area", addressCountry: "US" } }],
      })}</script></head><body></body></html>`;

    const result = await parseJobFromPageOrFetch(liveDoc, jobUrl, {
      fetchHtml: async (u) => {
        expect(u).toBe(jobUrl);
        return ssrHtml;
      },
    });

    expect(result).toMatchObject({
      title: "Fullstack Software Engineer",
      company: "Glean",
      location: "San Francisco Bay Area, US",
      site: "Welcome to the Jungle",
      parsedVia: "structured",
    });
    expect(result?.description).toContain("BA/BS in computer science");
  });

  it("omits credentials on the default fetch (anonymous HTML carries the JSON-LD)", async () => {
    const liveDoc = makeDoc("<div>hydrated app shell, no structured data</div>");
    const ssrHtml = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "Fullstack Software Engineer",
        hiringOrganization: { name: "Glean" },
        description: "<p>Build things.</p>",
      })}</script></head><body></body></html>`;

    const fetchMock = vi.fn(async () => ({ text: async () => ssrHtml }) as unknown as Response);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await parseJobFromPageOrFetch(liveDoc, jobUrl);
      expect(result).toMatchObject({ company: "Glean", parsedVia: "structured" });
      expect(fetchMock).toHaveBeenCalledWith(jobUrl, { credentials: "omit" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null when the live DOM is empty and the fetch fails", async () => {
    const liveDoc = makeDoc("<div>hydrated app shell, no structured data</div>");
    const result = await parseJobFromPageOrFetch(liveDoc, jobUrl, {
      fetchHtml: async () => {
        throw new Error("network error");
      },
    });
    expect(result).toBeNull();
  });
});
