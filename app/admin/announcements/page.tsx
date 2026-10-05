import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { deleteAnnouncement, saveAnnouncement } from "@/server/admin-actions";

export default async function AdminAnnouncementsPage() {
  const { data: announcements, error } = await createClient().from("announcements")
    .select("id,title,body,is_published,created_at").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load announcements: ${error.message}`);

  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold">Announcements</h2><p className="text-sm text-slate-500">Published notices can be displayed on the public homepage.</p></div>
      <article className="card">
        <h3 className="mb-3 text-lg font-bold">Create announcement</h3>
        <AdminActionForm action={saveAnnouncement} submitLabel="Create announcement">
          <label className="block text-sm">Title<input name="title" required maxLength={120} className="input mt-1" /></label>
          <label className="block text-sm">Message<textarea name="body" required maxLength={2000} rows={4} className="input mt-1" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" value="true" />Publish immediately</label>
        </AdminActionForm>
      </article>
      {(announcements ?? []).map((announcement) => (
        <article className="card grid gap-5 md:grid-cols-[1fr_18rem]" key={announcement.id}>
          <div><span className="tag">{announcement.is_published ? "Published" : "Draft"}</span><h3 className="mt-3 text-lg font-bold">{announcement.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{announcement.body}</p><time className="mt-3 block text-xs text-slate-500">{new Date(announcement.created_at).toLocaleString()}</time></div>
          <div className="space-y-4">
            <AdminActionForm action={saveAnnouncement} submitLabel="Save announcement">
              <input type="hidden" name="id" value={announcement.id} />
              <label className="block text-sm">Title<input name="title" required maxLength={120} defaultValue={announcement.title} className="input mt-1" /></label>
              <label className="block text-sm">Message<textarea name="body" required maxLength={2000} rows={3} defaultValue={announcement.body} className="input mt-1" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" value="true" defaultChecked={announcement.is_published} />Published</label>
            </AdminActionForm>
            <AdminActionForm action={deleteAnnouncement} submitLabel="Delete announcement"><input type="hidden" name="id" value={announcement.id} /></AdminActionForm>
          </div>
        </article>
      ))}
    </section>
  );
}
