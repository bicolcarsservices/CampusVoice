"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/server/auth-actions";
import AppearanceToggle from "@/components/AppearanceToggle";

type NavigationIconName = "bell" | "user" | "messages" | "post" | "plus" | "games" | "wallet" | "support";

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const common = {
    "aria-hidden": true as const,
    fill: "none",
    height: 22,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: 22,
  };

  switch (name) {
    case "bell":
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
    case "user":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>;
    case "messages":
      return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></svg>;
    case "support":
      return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2 1.2-4.2A7.5 7.5 0 1 1 20 11.5Z" /><path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01" /></svg>;
    case "post":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6m-3 3h6" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "games":
      return <svg {...common}><path d="M6 12h4m-2-2v4m8-1h.01M18 10h.01M7 6h10a4 4 0 0 1 3.9 3.1l1 4.5a2 2 0 0 1-3.3 1.9L16 13H8l-2.6 2.5a2 2 0 0 1-3.3-1.9l1-4.5A4 4 0 0 1 7 6z" /></svg>;
    case "wallet":
      return <svg {...common}><path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6" /><path d="M20 12h-4a2 2 0 0 0 0 4h4z" /><path d="M16 14h.01" /></svg>;
  }
}

function isActivePath(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function PublicNavbar({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  const bottomLinks: { href: string; label: string; icon: NavigationIconName; active: boolean }[] = [
    { href: "/dating", label: "Dating & Messages", icon: "messages", active: isActivePath(pathname, "/dating") || isActivePath(pathname, "/messages") },
    { href: "/games", label: "Games", icon: "games", active: isActivePath(pathname, "/games") },
    { href: "/wall/new", label: "Create Post", icon: "plus", active: isActivePath(pathname, "/wall/new") },
    { href: "/wallet", label: "Wallet", icon: "wallet", active: isActivePath(pathname, "/wallet") },
    { href: "/profile", label: "Profile & Settings", icon: "user", active: isActivePath(pathname, "/profile") },
  ];

  return (
    <>
      <header className="site-header z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <nav aria-label="Main navigation" className="public-navigation mx-auto max-w-7xl px-4 py-2">
          <Link href="/" className="public-brand" aria-label="CampusVoice home">
            <Image
              src="/campusvoice-logo.jpg"
              alt="CampusVoice"
              width={635}
              height={202}
              priority
              className="public-brand-logo"
            />
          </Link>
          <div className="public-nav-links">
            <Link href="/wall" aria-current={isActivePath(pathname, "/wall") && pathname !== "/wall/new" ? "page" : undefined} className={`public-nav-button${pathname === "/wall" ? " public-nav-active" : ""}`}>Freedom Wall</Link>
            <Link href="/schools" aria-current={isActivePath(pathname, "/schools") ? "page" : undefined} className={`public-nav-button${isActivePath(pathname, "/schools") ? " public-nav-active" : ""}`}>Schools</Link>
            <Link href="/subscription" aria-current={isActivePath(pathname, "/subscription") ? "page" : undefined} className={`public-nav-button${isActivePath(pathname, "/subscription") ? " public-nav-active" : ""}`}>Plans</Link>
            <Link href="/guidelines" aria-current={isActivePath(pathname, "/guidelines") ? "page" : undefined} className={`public-nav-button${isActivePath(pathname, "/guidelines") ? " public-nav-active" : ""}`}>Guidelines</Link>
          </div>
          <div className="public-nav-account">
            <AppearanceToggle compact />
            {signedIn && (
              <>
                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  aria-current={isActivePath(pathname, "/notifications") ? "page" : undefined}
                  title="Notifications"
                  className={`public-nav-icon${isActivePath(pathname, "/notifications") ? " public-nav-active" : ""}`}
                >
                  <NavigationIcon name="bell" />
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    aria-current={isActivePath(pathname, "/admin") ? "page" : undefined}
                    title="Admin"
                    className="public-nav-button public-nav-admin"
                  >
                    Admin
                  </Link>
                )}
                <form action={logout}><button type="submit" className="public-nav-logout">Log out</button></form>
              </>
            )}
            {!signedIn && (
              <>
                <Link href="/login" className="public-nav-button">Log in</Link>
                <Link href="/register" className="btn-primary">Create account</Link>
              </>
            )}
          </div>
        </nav>
      </header>
      {signedIn && (
        <nav aria-label="Quick navigation" className="bottom-navigation">
          <div className="bottom-navigation-inner">
            {bottomLinks.map(({ href, label, icon, active }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`bottom-navigation-link${label === "Create Post" ? " bottom-navigation-link-create" : ""}${active ? " bottom-navigation-link-active" : ""}`}
              >
                <NavigationIcon name={icon} />
              </Link>
            ))}
          </div>
        </nav>
      )}
      {signedIn && (
        <Link
          href="/support"
          className={`support-launcher${isActivePath(pathname, "/support") ? " support-launcher-active" : ""}`}
          aria-label="CampusVoice Support chat"
          title="CampusVoice Support"
        >
          <NavigationIcon name="support" />
        </Link>
      )}
    </>
  );
}
