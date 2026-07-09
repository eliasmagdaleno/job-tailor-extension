import "./options.css";
import ApiKeySection from "./sections/ApiKeySection";
import ProfileEditor from "./sections/ProfileEditor";
import ApplicationsTable from "./sections/ApplicationsTable";

export default function Options() {
  return (
    <div className="wb">
      <div className="wb__tape" aria-hidden="true" />
      <div className="wb__inner">
        <header className="wb__masthead">
          <span className="wb__shears" aria-hidden="true">
            ✂
          </span>
          <h1 className="wb__wordmark">Job Tailor</h1>
          <span className="wb__tagline">Made&#8209;to&#8209;measure · The Workbook</span>
        </header>
        <hr className="wb__seam" />

        <ApiKeySection />
        <ProfileEditor />
        <ApplicationsTable />
      </div>
    </div>
  );
}
