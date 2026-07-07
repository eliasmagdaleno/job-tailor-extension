import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { getApiKey, getMasterProfile, findApplicationByUrl, addApplication } from "../lib/storage";
import { renderResumeHtml, renderCoverLetterHtml, downloadPdf } from "../lib/pdfTemplate";
import type { JobData, MasterProfile, TailoredOutput } from "../lib/types";

type PopupState =
  | { step: "loading" }
  | { step: "setup-required"; missing: "apiKey" | "profile" }
  | { step: "ready"; apiKey: string; profile: MasterProfile; jobData: JobData | null }
  | { step: "generating"; apiKey: string; profile: MasterProfile; jobData: JobData }
  | {
      step: "generated";
      apiKey: string;
      profile: MasterProfile;
      jobData: JobData;
      output: TailoredOutput;
      alreadyLoggedOn: string | null; // dateApplied of the existing record, if any
    }
  | { step: "error"; message: string; retry: () => void };

export default function Popup() {
  const [state, setState] = useState<PopupState>({ step: "loading" });

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
    if (!profile) {
      setState({ step: "setup-required", missing: "profile" });
      return;
    }
    const jobData = await parseCurrentTab();
    setState({ step: "ready", apiKey, profile, jobData });
  }

  async function parseCurrentTab(): Promise<JobData | null> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    try {
      const result = await browser.tabs.sendMessage(tab.id, { type: "PARSE_JOB_REQUEST" });
      return (result as JobData | null) ?? null;
    } catch {
      return null;
    }
  }

  async function handleGenerate(jobData: JobData) {
    if (state.step !== "ready") return;
    const { apiKey, profile } = state;
    setState({ step: "generating", apiKey, profile, jobData });
    const response = (await browser.runtime.sendMessage({
      type: "GENERATE_TAILORED",
      jobData,
      profile,
      apiKey,
    })) as { ok: true; data: TailoredOutput } | { ok: false; error: string };

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
      setState({ step: "error", message: response.error, retry: () => void handleGenerate(jobData) });
    }
  }

  async function handleMarkAsApplied() {
    if (state.step !== "generated") return;
    const { jobData } = state;
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
  }

  async function handleDownloadResume() {
    if (state.step !== "generated") return;
    const html = renderResumeHtml(state.output, state.profile.contact);
    await downloadPdf(html, `${state.profile.contact.name} - Resume - ${state.jobData.company}.pdf`);
  }

  async function handleDownloadCoverLetter() {
    if (state.step !== "generated") return;
    const html = renderCoverLetterHtml(state.output, state.profile.contact);
    await downloadPdf(html, `${state.profile.contact.name} - Cover Letter - ${state.jobData.company}.pdf`);
  }

  if (state.step === "loading") return <p>Loading…</p>;

  if (state.step === "setup-required") {
    return (
      <div>
        <p>
          {state.missing === "apiKey"
            ? "Add your Anthropic API key to get started."
            : "Fill in your profile to get started."}
        </p>
        <button onClick={() => browser.runtime.openOptionsPage()}>Open Settings</button>
      </div>
    );
  }

  if (state.step === "ready") {
    if (!state.jobData) {
      return <p>Couldn't read this page automatically. Open a Welcome to the Jungle job listing and try again.</p>;
    }
    const jobData = state.jobData;
    return (
      <div>
        <p>
          Found: {jobData.title} @ {jobData.company}
        </p>
        <button onClick={() => handleGenerate(jobData)}>Generate</button>
      </div>
    );
  }

  if (state.step === "generating") return <p>Generating…</p>;

  if (state.step === "error") {
    return (
      <div>
        <p>{state.message}</p>
        <button onClick={state.retry}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Preview</h2>
      <p>{state.output.resume.summary}</p>
      <p>{state.output.coverLetter}</p>
      <button onClick={handleDownloadResume}>Download Resume PDF</button>
      <button onClick={handleDownloadCoverLetter}>Download Cover Letter PDF</button>
      {state.alreadyLoggedOn && <p>Already logged on {state.alreadyLoggedOn}.</p>}
      <button onClick={handleMarkAsApplied}>{state.alreadyLoggedOn ? "Log Anyway" : "Mark as Applied"}</button>
    </div>
  );
}
