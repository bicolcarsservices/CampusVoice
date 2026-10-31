import type { User } from "@supabase/supabase-js";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";
import PublicNavbar from "@/components/PublicNavbar";
import AnnouncementDock, { type PublicAnnouncement } from "@/components/AnnouncementDock";
import PresenceHeartbeat from "@/components/social/PresenceHeartbeat";
import SubscriptionApprovalToast from "@/components/SubscriptionApprovalToast";

export default async function Navbar() {
  let user: User | null = null;
  let isAdmin = false;
  let announcements: PublicAnnouncement[] = [];
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const [
      { user: sessionUser, error },
      { data: adminAccess, error: adminError },
      { data, error: announcementsError },
    ] = await Promise.all([
      getAuthUser(supabase),
      supabase.rpc("is_admin"),
      supabase.from("announcements")
        .select("id,title,body")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (error) console.error("Could not verify the signed-in user for navigation.", error);
    user = sessionUser;
    if (user && adminError) console.error("Could not verify administrator access for navigation.", adminError);
    else isAdmin = Boolean(user && adminAccess === true);
    if (announcementsError) throw new Error(`Could not load KanyaKanyaNa announcements: ${announcementsError.message}`);
    announcements = data ?? [];
  }

  return (
    <>
      {user && <PresenceHeartbeat />}
      {user && !isAdmin && <SubscriptionApprovalToast />}
      <PublicNavbar signedIn={Boolean(user)} />
      <AnnouncementDock announcements={announcements} signedIn={Boolean(user)} />
    </>
  );
}
