import { createClient } from "@/lib/supabase/server";
import AdminActionForm from "@/components/admin/AdminActionForm";
import { adminSetUserStatus } from "@/server/admin-actions";

export default async function AdminUsersPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = (searchParams?.q ?? "").trim().slice(0, 50);
  let query = createClient().from("profiles")
    .select("id,username,display_name,school_id,school_name,grade_level,status,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  const { data: users, error } = await query;
  if (error) throw new Error(`Could not load users: ${error.message}`);

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">User management</h2><p className="text-sm text-slate-500">Search the newest 100 profiles. Email addresses and credentials are intentionally not shown.</p></div>
      <form action="/admin/users" className="card flex flex-wrap gap-3">
        <label className="min-w-64 flex-1 text-sm">Search username or display name
          <input name="q" defaultValue={q} maxLength={50} className="input mt-1" />
        </label>
        <button className="btn-ghost self-end" type="submit">Search</button>
      </form>
      {!users?.length && <p className="card text-slate-500">No matching users.</p>}
      {(users ?? []).map((user) => (
        <article className="card grid gap-4 md:grid-cols-[1fr_18rem]" key={user.id}>
          <div>
            <h3 className="font-bold">{user.display_name} <span className="font-normal text-slate-500">@{user.username}</span></h3>
            <p className="mt-1 text-xs text-slate-500">{user.school_name ?? user.school_id ?? "No school"} · {user.grade_level ?? "Grade not set"}</p>
            <p className="mt-1 text-xs text-slate-500">Joined {new Date(user.created_at).toLocaleDateString()} · Account ID {user.id}</p>
          </div>
          <AdminActionForm action={adminSetUserStatus} submitLabel="Update status">
            <input type="hidden" name="user_id" value={user.id} />
            <label className="block text-sm">Account status
              <select className="input mt-1" name="status" defaultValue={user.status}>
                <option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
              </select>
            </label>
            <label className="block text-sm">Reason
              <input name="reason" maxLength={500} className="input mt-1" />
            </label>
          </AdminActionForm>
        </article>
      ))}
    </section>
  );
}
