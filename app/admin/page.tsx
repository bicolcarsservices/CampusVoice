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
  const adminTools = [
    ["Support inbox", "Reply to member questions as the CampusVoice Support team.", "/admin/support"],
    ["Review posts", "Approve, hide, reject, or restore community posts.", "/admin/posts"],
    ["Moderate comments", "Manage comment visibility and moderation reasons.", "/admin/comments"],
    ["Review reports", "Handle safety reports and record resolutions.", "/admin/reports"],
    ["Manage users", "Search members and update account status.", "/admin/users"],
    ["Subscriptions", "Verify payments, activate plans, and manage subscriptions.", "/admin/subscriptions"],
    ["Wallet", "Review top-ups and cash-outs, and update game rates.", "/admin/wallet"],
    ["Game rewards", "Review eligible reward claims.", "/admin/game-rewards"],
    ["Galactic Striker", "Manage game charges and payout requests.", "/admin/galactic-striker"],
    ["Plans and features", "Edit subscription plan details and included features.", "/admin/plans"],
    ["Website settings", "Update site details, posting limits, and moderation switches.", "/admin/settings"],
    ["Announcements", "Create and update community announcements.", "/admin/announcements"],
    ["Schools", "Add and update campus listings.", "/admin/schools"],
    ["Categories", "Add and update post categories.", "/admin/categories"],
  ] as const;
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminTools.map(([label, description, href]) => (
          <Link className="card admin-tool-link" href={href} key={href}>
            <h2 className="font-bold">{label} <span aria-hidden="true">→</span></h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
