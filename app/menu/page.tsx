import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { logout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

const menuLinks = [
  { label: "Profile", href: "/profile", icon: "◉", style: "blue" },
  { label: "Settings", href: "/settings", icon: "⚙", style: "slate" },
  { label: "Freedom Wall", href: "/wall", icon: "▣", style: "blue" },
  { label: "Create Post", href: "/wall/new", icon: "＋", style: "sky" },
  { label: "Dating & Messages", href: "/dating", icon: "♡", style: "rose" },
  { label: "Games", href: "/games", icon: "✦", style: "violet" },
  { label: "Wallet", href: "/wallet", icon: "▤", style: "amber" },
  { label: "Notifications", href: "/notifications", icon: "♧", style: "blue" },
  { label: "Schools", href: "/schools", icon: "⌂", style: "emerald" },
  { label: "Plans", href: "/subscription", icon: "✧", style: "amber" },
  { label: "Guidelines", href: "/guidelines", icon: "☷", style: "slate" },
  { label: "Chat support", href: "/support", icon: "?", style: "sky" },
];

export default async function MenuPage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: isAdmin, error: adminError }] = await Promise.all([
    supabase.from("profiles").select("username,display_name,avatar_path").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
  if (adminError) throw new Error(`Could not verify administrator access: ${adminError.message}`);
  if (!profile?.username) throw new Error("Your profile was not found. Please contact support.");

  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const links = isAdmin ? [...menuLinks, { label: "Admin", href: "/admin", icon: "⌘", style: "violet" }] : menuLinks;

  return (
    <div className="account-menu-page">
      <header className="account-menu-header">
        <div>
          <p className="eyebrow">KanyaKanyaNa</p>
          <h1>Menu</h1>
        </div>
        <Link href="/notifications" className="account-menu-notifications" aria-label="Notifications">♧</Link>
      </header>

      <Link href={`/profile/${encodeURIComponent(profile.username)}`} className="account-menu-profile">
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="account-menu-avatar" />
          : <span className="account-menu-avatar account-menu-avatar-fallback">{profile.display_name.slice(0, 1).toUpperCase()}</span>}
        <span className="account-menu-profile-copy">
          <strong>{profile.display_name}</strong>
          <span>See your profile</span>
        </span>
        <span className="account-menu-profile-arrow" aria-hidden="true">›</span>
      </Link>

      <nav className="account-menu-grid" aria-label="Menu">
        {links.map(({ label, href, icon, style }) => (
          <Link className="account-menu-tile" href={href} key={href}>
            <span className={`account-menu-icon account-menu-icon-${style}`} aria-hidden="true">{icon}</span>
            <span>{label}</span>
            <span className="account-menu-tile-arrow" aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>
      <form action={logout} className="account-menu-logout-form">
        <button type="submit" className="account-menu-logout">
          <span aria-hidden="true">↗</span>
          <span>Log out</span>
        </button>
      </form>
    </div>
  );
}
