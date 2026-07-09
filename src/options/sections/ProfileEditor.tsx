import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { getApiKey, getMasterProfile, setMasterProfile } from "../../lib/storage";
import { extractText } from "../../lib/fileTextExtractor";
import type { CoverLetterStylePreset, MasterProfile } from "../../lib/types";

const EMPTY_PROFILE: MasterProfile = {
  contact: { name: "", email: "" },
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

const PIECE_LETTER = (i: number) => String.fromCharCode(65 + (i % 26));

const STYLE_PRESETS: Array<{ value: CoverLetterStylePreset; label: string }> = [
  { value: "formal", label: "Formal" },
  { value: "conversational", label: "Conversational" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "direct", label: "Direct" },
];

export default function ProfileEditor() {
  const [profile, setProfile] = useState<MasterProfile>(EMPTY_PROFILE);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "importing" | "import-failed" | "imported">("idle");
  // The specific reason an import failed (e.g. an Anthropic API error), so the
  // user sees the real cause rather than a generic guess.
  const [importError, setImportError] = useState<string>("");

  // Raw, unnormalized text the user is currently typing. Kept separate from
  // `profile` so that delimiter keystrokes (Enter for bullets, comma for
  // skills) aren't eaten by a controlled value that re-renders from a
  // filtered array on every change. Normalized into `profile` on save.
  const [bulletsDrafts, setBulletsDrafts] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState<string>("");
  const [snippetInput, setSnippetInput] = useState<string>("");

  function resetDrafts(p: MasterProfile) {
    setBulletsDrafts(p.experience.map((exp) => exp.bullets.join("\n")));
  }

  useEffect(() => {
    void getMasterProfile().then((p) => {
      if (p) {
        setProfile(p);
        resetDrafts(p);
      }
    });
    void getApiKey().then(setApiKeyState);
  }, []);

  async function handleSave() {
    const normalized: MasterProfile = {
      ...profile,
      experience: profile.experience.map((exp, i) => ({
        ...exp,
        bullets: (bulletsDrafts[i] ?? "")
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
      })),
    };
    await setMasterProfile(normalized);
    setProfile(normalized);
    resetDrafts(normalized);
    setStatus("saved");
  }

  async function handleImport(file: File) {
    setImportError("");
    if (!apiKey) {
      setImportError("No API key set. Add your Anthropic API key above and save it first.");
      setStatus("import-failed");
      return;
    }
    setStatus("importing");
    try {
      const resumeText = await extractText(file);
      const response = (await browser.runtime.sendMessage({
        type: "IMPORT_PROFILE",
        resumeText,
        apiKey,
      })) as { ok: true; data: MasterProfile } | { ok: false; error: string };

      if (response.ok) {
        // Imported data is reviewable/editable before it's persisted — do not
        // auto-save, and do not claim "Saved." when nothing was written.
        setProfile(response.data);
        resetDrafts(response.data);
        setStatus("imported");
      } else {
        setImportError(response.error);
        setStatus("import-failed");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setStatus("import-failed");
    }
  }

  function addExperience() {
    setProfile({
      ...profile,
      experience: [...profile.experience, { company: "", title: "", startDate: "", endDate: "Present", bullets: [] }],
    });
    setBulletsDrafts([...bulletsDrafts, ""]);
  }

  function updateExperience(index: number, updates: Partial<MasterProfile["experience"][number]>) {
    setProfile({
      ...profile,
      experience: profile.experience.map((exp, i) => (i === index ? { ...exp, ...updates } : exp)),
    });
  }

  function updateBulletsDraft(index: number, value: string) {
    setBulletsDrafts((drafts) => drafts.map((d, i) => (i === index ? value : d)));
  }

  function removeExperience(index: number) {
    setProfile({ ...profile, experience: profile.experience.filter((_, i) => i !== index) });
    setBulletsDrafts((drafts) => drafts.filter((_, i) => i !== index));
  }

  function addEducation() {
    setProfile({
      ...profile,
      education: [...profile.education, { school: "", degree: "", field: "", gradDate: "" }],
    });
  }

  function updateEducation(index: number, updates: Partial<MasterProfile["education"][number]>) {
    setProfile({
      ...profile,
      education: profile.education.map((ed, i) => (i === index ? { ...ed, ...updates } : ed)),
    });
  }

  function removeEducation(index: number) {
    setProfile({ ...profile, education: profile.education.filter((_, i) => i !== index) });
  }

  function addSkill() {
    const skill = skillInput.trim();
    if (!skill) return;
    setProfile({ ...profile, skills: [...profile.skills, skill] });
    setSkillInput("");
  }

  function removeSkill(index: number) {
    setProfile({ ...profile, skills: profile.skills.filter((_, i) => i !== index) });
  }

  function addSnippet() {
    const snippet = snippetInput.trim();
    if (!snippet) return;
    setProfile({ ...profile, snippets: [...(profile.snippets ?? []), snippet] });
    setSnippetInput("");
  }

  function removeSnippet(index: number) {
    setProfile({ ...profile, snippets: (profile.snippets ?? []).filter((_, i) => i !== index) });
  }

  return (
    <section className="wb__clause">
      <div className="wb__clause-head">
        <span className="wb__clause-no">§ 02</span>
        <h2 className="wb__clause-title">Profile</h2>
        <span className="wb__clause-rule" aria-hidden="true" />
      </div>
      <p className="wb__lede">
        Used to generate every résumé and cover letter. Keep it complete and up to date.
      </p>

      <label className="wb__import">
        <span className="wb__import-hint">Import from resume file (.txt, .md, .pdf, or .docx)</span>
        <input
          className="wb__file"
          type="file"
          accept=".txt,.md,.pdf,.docx"
          onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
        />
      </label>
      {status === "importing" && <p className="wb__stamp wb__stamp--work">Importing…</p>}
      {status === "import-failed" && (
        <div className="wb__alert">
          <span className="wb__alert-label">Import failed</span>
          <p className="wb__alert-msg">
            {importError || "Unknown error."} You can also fill the form manually below.
          </p>
        </div>
      )}
      {status === "imported" && <p className="wb__stamp">Imported — review below, then click Save Profile.</p>}

      <fieldset className="wb__group">
        <span className="wb__label wb__group-label">Contact</span>
        <div className="wb__row">
          <input
            className="wb__input"
            placeholder="Full name"
            value={profile.contact.name}
            onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, name: e.target.value } })}
          />
          <input
            className="wb__input"
            placeholder="Email"
            value={profile.contact.email}
            onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, email: e.target.value } })}
          />
        </div>
      </fieldset>

      <div className="wb__field">
        <label className="wb__label" htmlFor="wb-summary">
          Summary
        </label>
        <textarea
          id="wb-summary"
          className="wb__textarea"
          value={profile.summary}
          onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
        />
      </div>

      <fieldset className="wb__group">
        <span className="wb__label wb__group-label">Experience</span>
        <div className="wb__pieces">
          {profile.experience.map((exp, i) => (
            <div className="wb__piece" key={i}>
              <div className="wb__piece-head">
                <span className="wb__piece-tag">Exp · {PIECE_LETTER(i)}</span>
                <button className="wb__btn wb__btn--snip" onClick={() => removeExperience(i)}>
                  Remove
                </button>
              </div>
              <div className="wb__row">
                <input className="wb__input" placeholder="Company" value={exp.company} onChange={(e) => updateExperience(i, { company: e.target.value })} />
                <input className="wb__input" placeholder="Title" value={exp.title} onChange={(e) => updateExperience(i, { title: e.target.value })} />
              </div>
              <div className="wb__row" style={{ marginTop: 16 }}>
                <input className="wb__input" placeholder="Start date" value={exp.startDate} onChange={(e) => updateExperience(i, { startDate: e.target.value })} />
                <input className="wb__input" placeholder="End date" value={exp.endDate} onChange={(e) => updateExperience(i, { endDate: e.target.value })} />
              </div>
              <textarea
                className="wb__textarea"
                style={{ marginTop: 16 }}
                placeholder="One bullet per line"
                value={bulletsDrafts[i] ?? ""}
                onChange={(e) => updateBulletsDraft(i, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="wb__actions">
          <button className="wb__btn wb__btn--ghost" onClick={addExperience}>
            Add Experience
          </button>
        </div>
      </fieldset>

      <fieldset className="wb__group">
        <span className="wb__label wb__group-label">Education</span>
        <div className="wb__pieces">
          {profile.education.map((ed, i) => (
            <div className="wb__piece" key={i}>
              <div className="wb__piece-head">
                <span className="wb__piece-tag">Edu · {PIECE_LETTER(i)}</span>
                <button className="wb__btn wb__btn--snip" onClick={() => removeEducation(i)}>
                  Remove
                </button>
              </div>
              <div className="wb__row">
                <input className="wb__input" placeholder="School" value={ed.school} onChange={(e) => updateEducation(i, { school: e.target.value })} />
                <input className="wb__input" placeholder="Degree" value={ed.degree} onChange={(e) => updateEducation(i, { degree: e.target.value })} />
              </div>
              <div className="wb__row" style={{ marginTop: 16 }}>
                <input className="wb__input" placeholder="Field" value={ed.field} onChange={(e) => updateEducation(i, { field: e.target.value })} />
                <input className="wb__input" placeholder="Graduation date" value={ed.gradDate} onChange={(e) => updateEducation(i, { gradDate: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <div className="wb__actions">
          <button className="wb__btn wb__btn--ghost" onClick={addEducation}>
            Add Education
          </button>
        </div>
      </fieldset>

      <div className="wb__field">
        <label className="wb__label" htmlFor="wb-skills">
          Skills
        </label>
        {profile.skills.length > 0 ? (
          <div className="wb__skills-wrap">
            {profile.skills.map((skill, i) => (
              <span className="wb__skill-chip" key={`${skill}-${i}`}>
                {skill}
                <button
                  type="button"
                  className="wb__skill-remove"
                  aria-label={`Remove ${skill}`}
                  onClick={() => removeSkill(i)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="wb__skills-empty">No skills added yet.</p>
        )}
        <input
          id="wb-skills"
          className="wb__input"
          placeholder="Type a skill and press Enter"
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSkill();
            }
          }}
          onBlur={addSkill}
        />
      </div>

      <fieldset className="wb__group">
        <span className="wb__label wb__group-label">Cover Letter Voice</span>

        <div className="wb__field">
          <label className="wb__label" htmlFor="wb-style-preset">
            Style
          </label>
          <select
            id="wb-style-preset"
            className="wb__input"
            value={profile.coverLetterStyle?.preset ?? ""}
            onChange={(e) => {
              const value = e.target.value as CoverLetterStylePreset | "";
              setProfile({
                ...profile,
                coverLetterStyle: value
                  ? { ...profile.coverLetterStyle, preset: value }
                  : undefined,
              });
            }}
          >
            <option value="">No preference</option>
            {STYLE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="wb__field">
          <textarea
            className="wb__textarea"
            placeholder='Optional notes to refine the tone (e.g. "keep it upbeat but not cheesy")'
            value={profile.coverLetterStyle?.customNotes ?? ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                coverLetterStyle: {
                  preset: profile.coverLetterStyle?.preset ?? "conversational",
                  customNotes: e.target.value,
                },
              })
            }
          />
        </div>

        <div className="wb__field">
          <label className="wb__label" htmlFor="wb-reference-letter">
            Reference cover letter
          </label>
          <p className="wb__lede">
            Paste or upload a cover letter you've written before. In the popup, you can opt in to
            having new cover letters match its voice.
          </p>
          <textarea
            id="wb-reference-letter"
            className="wb__textarea"
            placeholder="Paste a previous cover letter here..."
            value={profile.coverLetterReference ?? ""}
            onChange={(e) => setProfile({ ...profile, coverLetterReference: e.target.value })}
          />
          <label className="wb__import">
            <span className="wb__import-hint">Or upload a file (.txt, .md, .pdf, or .docx)</span>
            <input
              className="wb__file"
              type="file"
              accept=".txt,.md,.pdf,.docx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportError("");
                try {
                  const text = await extractText(file);
                  setProfile({ ...profile, coverLetterReference: text });
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : String(err));
                  setStatus("import-failed");
                }
              }}
            />
          </label>
        </div>

        <div className="wb__field">
          <label className="wb__label" htmlFor="wb-snippets">
            Snippets
          </label>
          <p className="wb__lede">
            Short notes — why you're passionate about this field, background details — to draw on
            when writing cover letters.
          </p>
          {(profile.snippets?.length ?? 0) > 0 ? (
            <div className="wb__skills-wrap">
              {profile.snippets!.map((snippet, i) => (
                <span className="wb__skill-chip" key={`${snippet}-${i}`}>
                  {snippet}
                  <button
                    type="button"
                    className="wb__skill-remove"
                    aria-label={`Remove ${snippet}`}
                    onClick={() => removeSnippet(i)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="wb__skills-empty">No snippets added yet.</p>
          )}
          <input
            id="wb-snippets"
            className="wb__input"
            placeholder="Type a snippet and press Enter"
            value={snippetInput}
            onChange={(e) => setSnippetInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSnippet();
              }
            }}
            onBlur={addSnippet}
          />
        </div>
      </fieldset>

      <div className="wb__actions">
        <button className="wb__btn wb__btn--primary" onClick={handleSave}>
          Save Profile
        </button>
        {status === "saved" && <p className="wb__stamp">Saved.</p>}
      </div>
    </section>
  );
}
