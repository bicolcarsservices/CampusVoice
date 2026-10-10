import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { logout } from "@/server/auth-actions";

export default async function Navbar() {
  let user: User | null = null;
  let isAdmin = false;
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    if (user) {
      const { data: adminAccess, error: adminError } = await supabase.rpc("is_admin");
      if (adminError) {
        console.error("Could not check administrator access for navigation.", adminError);
      } else {
        isAdmin = adminAccess === true;
      }
    }
  }
  return (
    <header className="site-header sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-extrabold text-brand">CampusVoice</Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/wall" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Freedom Wall</Link>
          <Link href="/schools" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Schools</Link>
          <Link href="/guidelines" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Guidelines</Link>
          {user ? (
            <>
              {isAdmin && <Link href="/admin" className="rounded-lg px-2 py-1 font-semibold text-brand hover:bg-violet-50 dark:hover:bg-slate-800">Admin</Link>}
              <Link href="/wall/new" className="btn-primary">Create Post</Link>
              <Link href="/wallet" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Wallet</Link>
              <Link href="/profile" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Profile</Link>
              <Link href="/subscription" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Plans</Link>
              <Link href="/notifications" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Notifications</Link>
              <form action={logout}><button type="submit" className="btn-ghost">Logout</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Login</Link>
              <Link href="/register" className="btn-primary">Register</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
