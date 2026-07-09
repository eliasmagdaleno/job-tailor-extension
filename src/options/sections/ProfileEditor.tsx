import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { getApiKey, getMasterProfile, setMasterProfile } from "../../lib/storage";
import type { MasterProfile } from "../../lib/types";

const EMPTY_PROFILE: MasterProfile = {
  contact: { name: "", email: "" },
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

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
  const [skillsDraft, setSkillsDraft] = useState<string>("");

  function resetDrafts(p: MasterProfile) {
    setBulletsDrafts(p.experience.map((exp) => exp.bullets.join("\n")));
    setSkillsDraft(p.skills.join(", "));
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
      skills: skillsDraft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
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
      const resumeText = await file.text();
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

  return (
    <div>
      <h2>Master Profile</h2>
      <label>
        Import from resume file (.txt or .md — plain text only in v1)
        <input
          type="file"
          accept=".txt,.md"
          onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
        />
      </label>
      {status === "importing" && <p>Importing…</p>}
      {status === "import-failed" && (
        <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
          Import failed: {importError || "Unknown error."} You can also fill the form manually below.
        </p>
      )}
      {status === "imported" && <p>Imported — review below, then click Save Profile.</p>}

      <fieldset>
        <legend>Contact</legend>
        <input
          placeholder="Full name"
          value={profile.contact.name}
          onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, name: e.target.value } })}
        />
        <input
          placeholder="Email"
          value={profile.contact.email}
          onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, email: e.target.value } })}
        />
      </fieldset>

      <label>
        Summary
        <textarea value={profile.summary} onChange={(e) => setProfile({ ...profile, summary: e.target.value })} />
      </label>

      <fieldset>
        <legend>Experience</legend>
        {profile.experience.map((exp, i) => (
          <div key={i}>
            <input placeholder="Company" value={exp.company} onChange={(e) => updateExperience(i, { company: e.target.value })} />
            <input placeholder="Title" value={exp.title} onChange={(e) => updateExperience(i, { title: e.target.value })} />
            <input placeholder="Start date" value={exp.startDate} onChange={(e) => updateExperience(i, { startDate: e.target.value })} />
            <input placeholder="End date" value={exp.endDate} onChange={(e) => updateExperience(i, { endDate: e.target.value })} />
            <textarea
              placeholder="One bullet per line"
              value={bulletsDrafts[i] ?? ""}
              onChange={(e) => updateBulletsDraft(i, e.target.value)}
            />
            <button onClick={() => removeExperience(i)}>Remove</button>
          </div>
        ))}
        <button onClick={addExperience}>Add Experience</button>
      </fieldset>

      <fieldset>
        <legend>Education</legend>
        {profile.education.map((ed, i) => (
          <div key={i}>
            <input placeholder="School" value={ed.school} onChange={(e) => updateEducation(i, { school: e.target.value })} />
            <input placeholder="Degree" value={ed.degree} onChange={(e) => updateEducation(i, { degree: e.target.value })} />
            <input placeholder="Field" value={ed.field} onChange={(e) => updateEducation(i, { field: e.target.value })} />
            <input placeholder="Graduation date" value={ed.gradDate} onChange={(e) => updateEducation(i, { gradDate: e.target.value })} />
            <button onClick={() => removeEducation(i)}>Remove</button>
          </div>
        ))}
        <button onClick={addEducation}>Add Education</button>
      </fieldset>

      <label>
        Skills (comma-separated)
        <input value={skillsDraft} onChange={(e) => setSkillsDraft(e.target.value)} />
      </label>

      <button onClick={handleSave}>Save Profile</button>
      {status === "saved" && <p>Saved.</p>}
    </div>
  );
}
