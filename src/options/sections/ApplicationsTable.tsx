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
    <div>
      <h2>Applications</h2>
      <button onClick={() => downloadXlsx(records)}>Export .xlsx</button>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Company</th>
            <th>Title</th>
            <th>Site</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>{r.dateApplied}</td>
              <td>{r.company}</td>
              <td>{r.jobTitle}</td>
              <td>{r.site}</td>
              <td>
                <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as ApplicationRecord["status"])}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button onClick={() => handleDelete(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
