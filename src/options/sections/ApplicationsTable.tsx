import { useEffect, useState } from "react";
import { getApplications, updateApplication, deleteApplication } from "../../lib/storage";
import { downloadXlsx } from "../../lib/xlsxExport";
import type { ApplicationRecord } from "../../lib/types";

const STATUSES: ApplicationRecord["status"][] = ["applied", "interviewing", "rejected", "offer"];

export default function ApplicationsTable() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setRecords(await getApplications());
  }

  async function handleStatusChange(id: string, status: ApplicationRecord["status"]) {
    await updateApplication(id, { status });
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteApplication(id);
    await refresh();
  }

  return (
    <section className="wb__clause">
      <div className="wb__clause-head">
        <span className="wb__clause-no">§ 03</span>
        <h2 className="wb__clause-title">The Order Book</h2>
        <span className="wb__clause-rule" aria-hidden="true" />
      </div>
      <p className="wb__lede">Every job you've logged, and where it stands.</p>

      <div className="wb__ledger-wrap">
        <div className="wb__ledger">
          <table className="wb__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Title</th>
                <th>Site</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="wb__cell-date">{r.dateApplied}</td>
                  <td className="wb__cell-company">{r.company}</td>
                  <td>{r.jobTitle}</td>
                  <td>{r.site}</td>
                  <td>
                    <select
                      className="wb__select"
                      value={r.status}
                      onChange={(e) => handleStatusChange(r.id, e.target.value as ApplicationRecord["status"])}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="wb__snip-ledger" onClick={() => handleDelete(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <p className="wb__ledger-empty">No orders yet — tailor a listing to open the book.</p>
          )}
        </div>
      </div>

      <div className="wb__actions">
        <button className="wb__btn wb__btn--ghost" onClick={() => downloadXlsx(records)}>
          Export .xlsx
        </button>
      </div>
    </section>
  );
}
