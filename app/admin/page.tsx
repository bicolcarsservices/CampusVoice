import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const { data, error } = await createClient().rpc("admin_stats");
  if (error) throw new Error(`Could not load admin statistics: ${error.message}`);
  const labels: Record<string, string> = {
    total_users: "Total users", active_users_30d: "Active users (30d)", free_users: "Free users",
    basic_users: "Basic users", premium_users: "Premium users", total_posts: "Total posts",
    posts_today: "Posts today", pending_posts: "Pending posts", reported_posts: "Reported posts",
    removed_posts: "Removed posts", total_comments: "Total comments",
    active_subscriptions: "Active subscriptions", expired_subscriptions: "Expired subscriptions",
  };
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(labels).map(([key, label]) => (
          <article className="card" key={key}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-extrabold">{Number(data?.[key] ?? 0).toLocaleString()}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link className="card hover:border-violet-300" href="/admin/posts"><h2 className="font-bold">Review posts →</h2><p className="mt-1 text-sm text-slate-500">Approve, hide, reject, or restore content.</p></Link>
        <Link className="card hover:border-violet-300" href="/admin/reports"><h2 className="font-bold">Review reports →</h2><p className="mt-1 text-sm text-slate-500">Handle safety reports and log resolutions.</p></Link>
        <Link className="card hover:border-violet-300" href="/admin/users"><h2 className="font-bold">Manage users →</h2><p className="mt-1 text-sm text-slate-500">Search members and manage account status.</p></Link>
        <Link className="card hover:border-violet-300" href="/admin/settings"><h2 className="font-bold">Website settings →</h2><p className="mt-1 text-sm text-slate-500">Update posting limits and moderation switches.</p></Link>
      </div>
    </section>
  );
}
