import { describe, it, expect } from "vitest";
import { parseJobFromPage } from "../src/content-scripts/parseJobFromPage";

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

  it("returns null when neither strategy finds enough content", () => {
    const doc = makeDoc("<p>nothing useful here</p>");
    expect(parseJobFromPage(doc, "https://example.com")).toBeNull();
  });
});
