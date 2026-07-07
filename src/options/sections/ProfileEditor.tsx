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
  const [status, setStatus] = useState<"idle" | "saved" | "importing" | "import-failed">("idle");

  useEffect(() => {
    void getMasterProfile().then((p) => p && setProfile(p));
    void getApiKey().then(setApiKeyState);
  }, []);

  async function handleSave() {
    await setMasterProfile(profile);
    setStatus("saved");
  }

  async function handleImport(file: File) {
    if (!apiKey) {
      setStatus("import-failed");
      return;
    }
    setStatus("importing");
    const resumeText = await file.text();
    const response = (await browser.runtime.sendMessage({
      type: "IMPORT_PROFILE",
      resumeText,
      apiKey,
    })) as { ok: true; data: MasterProfile } | { ok: false; error: string };

    if (response.ok) {
      setProfile(response.data);
      setStatus("saved");
    } else {
      setStatus("import-failed");
    }
  }

  function addExperience() {
    setProfile({
      ...profile,
      experience: [...profile.experience, { company: "", title: "", startDate: "", endDate: "Present", bullets: [] }],
    });
  }

  function updateExperience(index: number, updates: Partial<MasterProfile["experience"][number]>) {
    setProfile({
      ...profile,
      experience: profile.experience.map((exp, i) => (i === index ? { ...exp, ...updates } : exp)),
    });
  }

  function removeExperience(index: number) {
    setProfile({ ...profile, experience: profile.experience.filter((_, i) => i !== index) });
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
        Import from resume file
        <input
          type="file"
          accept=".txt,.pdf,.docx"
          onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
        />
      </label>
      {status === "importing" && <p>Importing…</p>}
      {status === "import-failed" && <p>Import failed. Set your API key first, or fill the form manually.</p>}

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
              value={exp.bullets.join("\n")}
              onChange={(e) => updateExperience(i, { bullets: e.target.value.split("\n").filter(Boolean) })}
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
        <input
          value={profile.skills.join(", ")}
          onChange={(e) => setProfile({ ...profile, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        />
      </label>

      <button onClick={handleSave}>Save Profile</button>
      {status === "saved" && <p>Saved.</p>}
    </div>
  );
}
