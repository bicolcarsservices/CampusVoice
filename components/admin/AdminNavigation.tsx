"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  ["Overview", "/admin"],
  ["Support inbox", "/admin/support"],
  ["Posts", "/admin/posts"],
  ["Comments", "/admin/comments"],
  ["Reports", "/admin/reports"],
  ["Users", "/admin/users"],
  ["Subscriptions", "/admin/subscriptions"],
  ["Wallet", "/admin/wallet"],
  ["Game rewards", "/admin/game-rewards"],
  ["Galactic Striker", "/admin/galactic-striker"],
  ["Plans", "/admin/plans"],
  ["Settings", "/admin/settings"],
  ["Announcements", "/admin/announcements"],
  ["Schools", "/admin/schools"],
  ["Categories", "/admin/categories"],
] as const;

export default function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin navigation" className="admin-navigation">
      {adminLinks.map(([label, href]) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`admin-navigation-link${active ? " admin-navigation-link-active" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
