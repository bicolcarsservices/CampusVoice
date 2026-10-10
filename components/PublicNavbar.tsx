"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/server/auth-actions";

export default function PublicNavbar({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="site-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <nav aria-label="Main navigation" className="public-navigation mx-auto max-w-7xl px-4 py-3">
        <Link href="/" className="public-brand">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-sm dark:bg-violet-950">CV</span>
          <span>CampusVoice</span>
        </Link>
        <div className="public-nav-links">
          <Link href="/wall" className="public-nav-button">Freedom Wall</Link>
          <Link href="/schools" className="public-nav-button">Schools</Link>
          {signedIn && <Link href="/wall/new" className="public-nav-button public-nav-highlight">Create Post</Link>}
          <details className="games-menu">
            <summary className="public-nav-button">Games <span aria-hidden="true">⌄</span></summary>
            <div className="games-menu-panel">
              <Link href="/games/campus-coin-rush" className="games-menu-item">Campus Coin Rush</Link>
              <Link href="/games/galactic-striker" className="games-menu-item">Galactic Striker</Link>
            </div>
          </details>
          <Link href="/subscription" className="public-nav-button">Plans</Link>
          {signedIn && (
            <>
              <Link href="/wallet" className="public-nav-button">Wallet</Link>
              <Link href="/notifications" className="public-nav-button">Notifications</Link>
              <Link href="/profile" className="public-nav-button">Profile</Link>
              {isAdmin && <Link href="/admin" className="public-nav-button public-nav-admin">Admin</Link>}
            </>
          )}
          <Link href="/guidelines" className="public-nav-button">Guidelines</Link>
        </div>
        <div className="public-nav-account">
          {signedIn ? (
            <form action={logout}><button type="submit" className="btn-ghost">Log out</button></form>
          ) : (
            <>
              <Link href="/login" className="public-nav-button">Log in</Link>
              <Link href="/register" className="btn-primary">Create account</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
