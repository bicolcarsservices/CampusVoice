import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { logout } from "@/server/auth-actions";

export default async function Navbar() {
  const { user } = await getAuthUser(createClient());
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-extrabold text-brand">CampusVoice</Link>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/wall" className="px-2 py-1 hover:underline">Freedom Wall</Link>
          {user ? (
            <>
              <Link href="/wall/new" className="btn-primary">Create Post</Link>
              <form action={logout}><button className="btn-ghost">Logout</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 py-1 hover:underline">Login</Link>
              <Link href="/register" className="btn-primary">Register</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
