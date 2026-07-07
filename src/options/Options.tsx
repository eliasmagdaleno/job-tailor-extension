import ApiKeySection from "./sections/ApiKeySection";
import ProfileEditor from "./sections/ProfileEditor";
import ApplicationsTable from "./sections/ApplicationsTable";

export default function Options() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Job Tailor Settings</h1>
      <ApiKeySection />
      <ProfileEditor />
      <ApplicationsTable />
    </div>
  );
}
