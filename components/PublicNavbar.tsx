"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="site-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <nav aria-label="Main navigation" className="public-navigation mx-auto max-w-7xl px-4 py-3">
        <Link href="/" className="public-brand">
          <Image
            src="/campusvoice-logo.jpg"
            alt="CampusVoice"
            width={635}
            height={202}
            priority
            className="public-brand-logo"
          />
        </Link>
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
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="public-site-links"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
        <div id="public-site-links" className={`public-nav-links${menuOpen ? " public-nav-links-open" : ""}`}>
          <Link href="/wall" className="public-nav-button" onClick={() => setMenuOpen(false)}>Freedom Wall</Link>
          <Link href="/schools" className="public-nav-button" onClick={() => setMenuOpen(false)}>Schools</Link>
          {signedIn && <Link href="/wall/new" className="public-nav-button public-nav-highlight" onClick={() => setMenuOpen(false)}>Create Post</Link>}
          <Link href="/games" className="public-nav-button" onClick={() => setMenuOpen(false)}>Games</Link>
          <Link href="/subscription" className="public-nav-button" onClick={() => setMenuOpen(false)}>Plans</Link>
          {signedIn && (
            <>
              <Link href="/wallet" className="public-nav-button" onClick={() => setMenuOpen(false)}>Wallet</Link>
              <Link href="/notifications" className="public-nav-button" onClick={() => setMenuOpen(false)}>Notifications</Link>
              <Link href="/profile" className="public-nav-button" onClick={() => setMenuOpen(false)}>Profile</Link>
              {isAdmin && <Link href="/admin" className="public-nav-button public-nav-admin" onClick={() => setMenuOpen(false)}>Admin</Link>}
            </>
          )}
          <Link href="/guidelines" className="public-nav-button" onClick={() => setMenuOpen(false)}>Guidelines</Link>
        </div>
      </nav>
    </header>
  );
}
