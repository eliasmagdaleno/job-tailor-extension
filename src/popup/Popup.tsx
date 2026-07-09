import { useEffect, useState, type ReactNode } from "react";
import browser from "webextension-polyfill";
import { getApiKey, getMasterProfile, findApplicationByUrl, addApplication } from "../lib/storage";
import { renderCoverLetterHtml, downloadPdf } from "../lib/pdfTemplate";
import { downloadResumePdf } from "../lib/resumePdf";
import type { GenerationParts, JobData, MasterProfile, TailoredOutput } from "../lib/types";

type Choice = "resume" | "coverLetter" | "both";
const CHOICE_TO_PARTS: Record<Choice, GenerationParts> = {
  resume: { resume: true, coverLetter: false },
  coverLetter: { resume: false, coverLetter: true },
  both: { resume: true, coverLetter: true },
};

type PopupState =
  | { step: "loading" }
  | { step: "setup-required"; missing: "apiKey" | "profile" }
  | {
      step: "ready";
      apiKey: string;
      profile: MasterProfile;
      jobData: JobData | null;
      // Why no job was read, when jobData is null. "unsupported-page": no
      // content script responded (not a supported site, or still loading).
      // "no-job": the content script ran but found no listing on the page.
      unavailable: "unsupported-page" | "no-job" | null;
      alreadyLoggedOn: string | null; // dateApplied of the existing record, if any
    }
  | {
      step: "generating";
      apiKey: string;
      profile: MasterProfile;
      jobData: JobData;
      alreadyLoggedOn: string | null;
    }
  | {
      step: "generated";
      apiKey: string;
      profile: MasterProfile;
      jobData: JobData;
      output: TailoredOutput;
      alreadyLoggedOn: string | null; // dateApplied of the existing record, if any
    }
  | { step: "error"; message: string; retry: () => void };

/**
 * The cloth: every state renders inside this shell so the tick-ruler spine,
 * masthead, and stitched seam stay continuous across the flow.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="jt">
      <div className="jt__ruler" aria-hidden="true" />
      <div className="jt__body">
        <header className="jt__masthead">
          <span className="jt__shears" aria-hidden="true">
            ✂
          </span>
          <span className="jt__wordmark">Job Tailor</span>
          <span className="jt__tagline">Made to measure</span>
        </header>
        <div className="jt__seam" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

function isProfileIncomplete(profile: MasterProfile): boolean {
  return (
    !profile.contact.name.trim() ||
    !profile.contact.email.trim() ||
    (profile.experience.length === 0 && !profile.summary.trim())
  );
}

export default function Popup() {
  const [state, setState] = useState<PopupState>({ step: "loading" });
  const [logging, setLogging] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("both");

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      setState({ step: "setup-required", missing: "apiKey" });
      return;
    }
    const profile = await getMasterProfile();
    if (!profile || isProfileIncomplete(profile)) {
      setState({ step: "setup-required", missing: "profile" });
      return;
    }
    const parsed = await parseCurrentTab();
    const jobData = parsed.kind === "found" ? parsed.jobData : null;
    const alreadyLoggedOn = jobData
      ? ((await findApplicationByUrl(jobData.url))?.dateApplied ?? null)
      : null;
    setState({
      step: "ready",
      apiKey,
      profile,
      jobData,
      unavailable: parsed.kind === "found" ? null : parsed.kind,
      alreadyLoggedOn,
    });
  }

  async function parseCurrentTab(): Promise<
    | { kind: "found"; jobData: JobData }
    | { kind: "unsupported-page" }
    | { kind: "no-job" }
  > {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { kind: "unsupported-page" };
    try {
      const result = await browser.tabs.sendMessage(tab.id, { type: "PARSE_JOB_REQUEST" });
      if (result) return { kind: "found", jobData: result as JobData };
      // The content script ran but neither strategy found a listing.
      return { kind: "no-job" };
    } catch {
      // sendMessage rejects ("receiving end does not exist") when no content
      // script is listening on this tab — i.e. it's not a supported page, or
      // the page hasn't finished loading the script yet.
      return { kind: "unsupported-page" };
    }
  }

  async function handleGenerate(jobData: JobData, parts: GenerationParts) {
    if (state.step !== "ready") return;
    const { apiKey, profile, alreadyLoggedOn } = state;
    setState({ step: "generating", apiKey, profile, jobData, alreadyLoggedOn });

    let response: { ok: true; data: TailoredOutput } | { ok: false; error: string };
    try {
      response = (await browser.runtime.sendMessage({
        type: "GENERATE_TAILORED",
        jobData,
        profile,
        apiKey,
        parts,
      })) as { ok: true; data: TailoredOutput } | { ok: false; error: string };
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : String(err),
        retry: () => void handleGenerate(jobData, parts),
      });
      return;
    }

    if (response.ok) {
      const existing = await findApplicationByUrl(jobData.url);
      setState({
        step: "generated",
        apiKey,
        profile,
        jobData,
        output: response.data,
        alreadyLoggedOn: existing?.dateApplied ?? null,
      });
    } else {
      setState({ step: "error", message: response.error, retry: () => void handleGenerate(jobData, parts) });
    }
  }

  async function handleMarkAsApplied() {
    if (state.step !== "generated" || logging) return;
    const { jobData } = state;
    setLogging(true);
    try {
      const dateApplied = new Date().toISOString().slice(0, 10);
      await addApplication({
        id: crypto.randomUUID(),
        dateApplied,
        company: jobData.company,
        jobTitle: jobData.title,
        site: jobData.site,
        jobUrl: jobData.url,
        status: "applied",
      });
      setState({ ...state, alreadyLoggedOn: dateApplied });
    } finally {
      setLogging(false);
    }
  }

  async function handleDownloadResume() {
    if (state.step !== "generated") return;
    if (!state.output.resume) return;
    setDownloadError(null);
    try {
      downloadResumePdf(
        state.output.resume,
        state.profile,
        `${state.profile.contact.name} - Resume - ${state.jobData.company}.pdf`
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDownloadCoverLetter() {
    if (state.step !== "generated") return;
    if (!state.output.coverLetter) return;
    setDownloadError(null);
    try {
      const html = renderCoverLetterHtml(state.output, state.profile.contact);
      await downloadPdf(
        html,
        `${state.profile.contact.name} - Cover Letter - ${state.jobData.company}.pdf`
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    }
  }

  if (state.step === "loading") {
    return (
      <Frame>
        <div className="jt__status">
          <span>Measuring</span>
          <span className="jt__stitch" aria-hidden="true" />
        </div>
      </Frame>
    );
  }

  if (state.step === "setup-required") {
    return (
      <Frame>
        <span className="jt__label">Fitting room</span>
        <p className="jt__lede">
          {state.missing === "apiKey"
            ? "Add your Anthropic API key to get started."
            : "Fill in your profile to get started."}
        </p>
        <div className="jt__actions">
          <button
            className="jt__btn jt__btn--primary"
            onClick={() => browser.runtime.openOptionsPage()}
          >
            Open Settings
          </button>
        </div>
      </Frame>
    );
  }

  if (state.step === "ready") {
    if (!state.jobData) {
      return (
        <Frame>
          <span className="jt__label">No cloth on the table</span>
          <p className="jt__lede">
            {state.unavailable === "unsupported-page"
              ? "This doesn't look like a Welcome to the Jungle job page yet. Open a job listing on welcometothejungle.com — and let it finish loading — then reopen this popup."
              : "Couldn't find a job listing on this page. Make sure you've opened a specific job posting (not a search or company page) and that it has finished loading."}
          </p>
        </Frame>
      );
    }
    const jobData = state.jobData;
    return (
      <Frame>
        <div className="jt__tag">
          <span className="jt__tag-eyebrow">On the table</span>
          <div className="jt__tag-title">
            {jobData.title} @ {jobData.company}
          </div>
        </div>
        {state.alreadyLoggedOn && (
          <p className="jt__stamp">Already logged on {state.alreadyLoggedOn}.</p>
        )}
        <fieldset className="jt__choice" role="radiogroup" aria-label="What to generate">
          {(["resume", "coverLetter", "both"] as const).map((value) => (
            <label key={value} className="jt__choice-opt">
              <input
                type="radio"
                name="jt-choice"
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              <span>{value === "resume" ? "Résumé" : value === "coverLetter" ? "Cover letter" : "Both"}</span>
            </label>
          ))}
        </fieldset>
        <div className="jt__actions">
          <button
            className="jt__btn jt__btn--primary"
            onClick={() => handleGenerate(jobData, CHOICE_TO_PARTS[choice])}
          >
            Generate
          </button>
        </div>
      </Frame>
    );
  }

  if (state.step === "generating") {
    return (
      <Frame>
        <div className="jt__status">
          <span>Tailoring</span>
          <span className="jt__stitch" aria-hidden="true" />
        </div>
        <p className="jt__note">
          Cutting the résumé and cover letter to fit this listing.
        </p>
      </Frame>
    );
  }

  if (state.step === "error") {
    return (
      <Frame>
        <div className="jt__alert" role="alert">
          <span className="jt__label jt__alert-label">Snag</span>
          <p className="jt__alert-msg">{state.message}</p>
        </div>
        <div className="jt__actions">
          <button className="jt__btn jt__btn--ghost" onClick={state.retry}>
            Retry
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <h2 className="jt__preview-title">Preview</h2>
      {state.output.resume && (
        <div className="jt__section">
          <span className="jt__label">Summary</span>
          <p className="jt__excerpt">{state.output.resume.summary}</p>
        </div>
      )}
      {state.output.coverLetter && (
        <div className="jt__section">
          <span className="jt__label">Cover letter</span>
          <p className="jt__excerpt jt__excerpt--letter">{state.output.coverLetter}</p>
        </div>
      )}
      <div className="jt__actions">
        {state.output.resume && (
          <button className="jt__btn jt__btn--primary" onClick={handleDownloadResume}>
            Download Résumé PDF
          </button>
        )}
        {state.output.coverLetter && (
          <button className="jt__btn jt__btn--ghost" onClick={handleDownloadCoverLetter}>
            Download Cover Letter PDF
          </button>
        )}
      </div>
      {downloadError && (
        <p className="jt__inline-error" role="alert">
          PDF export failed: {downloadError}
        </p>
      )}
      {state.alreadyLoggedOn && (
        <p className="jt__stamp">Already logged on {state.alreadyLoggedOn}.</p>
      )}
      <div className="jt__actions">
        <button
          className="jt__btn jt__btn--ghost"
          onClick={handleMarkAsApplied}
          disabled={logging}
        >
          {state.alreadyLoggedOn ? "Log Anyway" : "Mark as Applied"}
        </button>
      </div>
    </Frame>
  );
}
