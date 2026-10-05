import { createClient } from "@/lib/supabase/server";
import AdminActionForm from "@/components/admin/AdminActionForm";
import { adminResolveReport } from "@/server/admin-actions";

export default async function AdminReportsPage() {
  const { data: reports, error } = await createClient().from("reports")
    .select("id,reporter_id,post_id,comment_id,reason,details,status,action_taken,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load reports: ${error.message}`);

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Safety reports</h2><p className="text-sm text-slate-500">Reporter identity and moderation details are visible only in this authorized admin area.</p></div>
      {!reports?.length && <p className="card text-slate-500">No reports have been submitted.</p>}
      {(reports ?? []).map((report) => (
        <article className="card space-y-3" key={report.id}>
          <header className="flex flex-wrap justify-between gap-2">
            <div><span className="tag">{report.reason.replaceAll("_", " ")}</span><span className="ml-2 text-sm capitalize">{report.status}</span></div>
            <time className="text-xs text-slate-500">{new Date(report.created_at).toLocaleString()}</time>
          </header>
          <p className="text-sm"><strong>Reporter:</strong> <code>{report.reporter_id}</code></p>
          <p className="text-sm"><strong>Target:</strong> {report.post_id ? `Post ${report.post_id}` : `Comment ${report.comment_id}`}</p>
          {report.details && <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">{report.details}</p>}
          {report.action_taken && <p className="text-sm text-slate-500">Previous action: {report.action_taken}</p>}
          <AdminActionForm action={adminResolveReport} submitLabel="Save report status">
            <input type="hidden" name="report_id" value={report.id} />
            <label className="block text-sm">Status
              <select className="input mt-1" name="status" defaultValue={report.status === "pending" ? "reviewing" : report.status}>
                <option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
              </select>
            </label>
            <label className="block text-sm">Moderation action / reason
              <input name="reason" maxLength={500} defaultValue={report.action_taken ?? ""} className="input mt-1" />
            </label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}
