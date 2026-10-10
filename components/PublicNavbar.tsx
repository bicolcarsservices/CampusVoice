"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/server/auth-actions";

export default function PublicNavbar({
  signedIn,
}: {
  signedIn: boolean;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="site-header border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex min-h-16 items-center justify-between gap-3 py-2">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-brand">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-sm dark:bg-violet-950">CV</span>
            CampusVoice
          </Link>
          <div className="flex items-center gap-2 text-sm">
            {signedIn ? (
              <>
                <Link href="/profile" className="hidden rounded-lg px-3 py-2 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 sm:inline-flex">My profile</Link>
                <form action={logout}><button type="submit" className="btn-ghost">Log out</button></form>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Log in</Link>
                <Link href="/register" className="btn-primary">Create account</Link>
              </>
            )}
          </div>
        </div>
      </div>
      <nav aria-label="Main navigation" className="bottom-navigation">
        <Link href="/wall" className="bottom-nav-link"><span aria-hidden="true">✦</span><span>Freedom Wall</span></Link>
        <Link href="/schools" className="bottom-nav-link"><span aria-hidden="true">⌂</span><span>Schools</span></Link>
        {signedIn && <Link href="/wall/new" className="bottom-nav-link"><span aria-hidden="true">＋</span><span>Create Post</span></Link>}
        <details className="games-menu bottom-games-menu">
          <summary className="bottom-nav-link"><span aria-hidden="true">🎮</span><span>Games</span></summary>
          <div className="games-menu-panel games-menu-panel-up">
            <Link href="/games/campus-coin-rush" className="games-menu-item">Campus Coin Rush</Link>
            <Link href="/games/galactic-striker" className="games-menu-item">Galactic Striker</Link>
          </div>
        </details>
        <Link href="/subscription" className="bottom-nav-link"><span aria-hidden="true">◇</span><span>Plans</span></Link>
        {signedIn && <Link href="/wallet" className="bottom-nav-link"><span aria-hidden="true">◈</span><span>Wallet</span></Link>}
      </nav>
    </header>
  );
}
