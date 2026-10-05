import { createClient } from "@/lib/supabase/server";
import AdminActionForm from "@/components/admin/AdminActionForm";
import { adminSetPostStatus } from "@/server/admin-actions";

export default async function AdminPostsPage() {
  const { data: posts, error } = await createClient().from("admin_posts")
    .select("id,anon_number,created_at,content,image_path,status,is_anonymous,username,report_count")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load moderation queue: ${error.message}`);

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Post moderation</h2><p className="text-sm text-slate-500">Newest 50 posts, including non-public statuses.</p></div>
      {!posts?.length && <p className="card text-slate-500">No posts to review.</p>}
      {(posts ?? []).map((post) => (
        <article className="card space-y-4" key={post.id}>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="tag">{post.is_anonymous ? `Anonymous Post #${post.anon_number}` : `@${post.username ?? "member"}`}</span>
              <span className="ml-2 text-xs capitalize text-slate-500">{post.status} · {post.report_count} reports</span>
            </div>
            <time className="text-xs text-slate-500">{new Date(post.created_at).toLocaleString()}</time>
          </header>
          <p className="whitespace-pre-wrap break-words">{post.content}</p>
          <AdminActionForm action={adminSetPostStatus} submitLabel="Save moderation">
            <input type="hidden" name="post_id" value={post.id} />
            <label className="block text-sm">Status
              <select className="input mt-1" name="status" defaultValue={post.status}>
                {["pending", "approved", "rejected", "flagged", "hidden", "removed"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="block text-sm">Reason (optional)
              <input name="reason" maxLength={500} className="input mt-1" />
            </label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}
