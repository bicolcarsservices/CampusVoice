import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { adminSetCommentStatus } from "@/server/admin-actions";

export default async function AdminCommentsPage() {
  const { data: comments, error } = await createClient().from("comments")
    .select("id,post_id,parent_id,content,status,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load comments: ${error.message}`);
  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Comment moderation</h2><p className="text-sm text-slate-500">Latest 100 comments. Comment author identifiers are not exposed in this view.</p></div>
      {!comments?.length && <p className="card text-slate-500">No comments to review.</p>}
      {(comments ?? []).map((comment) => (
        <article key={comment.id} className="card space-y-3">
          <div className="flex flex-wrap justify-between gap-2"><span className="tag capitalize">{comment.status}</span><time className="text-xs text-slate-500">{new Date(comment.created_at).toLocaleString()}</time></div>
          <p className="text-xs text-slate-500">Post {comment.post_id}{comment.parent_id ? ` · Reply to ${comment.parent_id}` : ""}</p>
          <p className="whitespace-pre-wrap">{comment.content}</p>
          <AdminActionForm action={adminSetCommentStatus} submitLabel="Save status">
            <input type="hidden" name="comment_id" value={comment.id} />
            <label className="block text-sm">Status<select name="status" defaultValue={comment.status} className="input mt-1"><option value="approved">Approved</option><option value="hidden">Hidden</option><option value="removed">Removed</option></select></label>
            <label className="block text-sm">Reason<input name="reason" maxLength={500} className="input mt-1" /></label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}
