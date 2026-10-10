import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: allowed, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(`Could not verify administrator access: ${error.message}`);
  if (!allowed) {
    return (
      <section className="card mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          You are signed in, but this account is not registered as a CampusVoice administrator yet.
          In the Supabase SQL Editor, run <code>supabase/first-admin.sql</code> using the email shown
          under Authentication → Users. Then log out and sign back in.
        </p>
        <Link href="/" className="btn-primary mt-5">Return home</Link>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Private workspace</p><h1 className="text-3xl font-extrabold">Admin dashboard</h1></div>
          <Link href="/" className="btn-ghost">View public site</Link>
        </div>
        <nav aria-label="Admin navigation" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm dark:border-slate-800">
          {[["Overview", "/admin"], ["Posts", "/admin/posts"], ["Comments", "/admin/comments"], ["Reports", "/admin/reports"], ["Users", "/admin/users"],
            ["Subscriptions", "/admin/subscriptions"], ["Wallet", "/admin/wallet"], ["Game rewards", "/admin/game-rewards"], ["Galactic Striker", "/admin/galactic-striker"], ["Plans", "/admin/plans"], ["Settings", "/admin/settings"],
            ["Announcements", "/admin/announcements"], ["Schools", "/admin/schools"],
            ["Categories", "/admin/categories"]].map(([label, href]) => (
            <Link className="rounded-lg px-3 py-2 font-medium hover:bg-violet-50 hover:text-brand dark:hover:bg-slate-800" href={href} key={href}>{label}</Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
