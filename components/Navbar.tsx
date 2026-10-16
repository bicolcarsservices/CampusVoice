import type { User } from "@supabase/supabase-js";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";
import PublicNavbar from "@/components/PublicNavbar";
import PresenceHeartbeat from "@/components/social/PresenceHeartbeat";
import SubscriptionApprovalToast from "@/components/SubscriptionApprovalToast";

export default async function Navbar() {
  let user: User | null = null;
  let isAdmin = false;
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { user: sessionUser, error } = await getAuthUser(supabase);
    if (error) console.error("Could not verify the signed-in user for navigation.", error);
    user = sessionUser;
    if (user) {
      const { data: adminAccess, error: adminError } = await supabase.rpc("is_admin");
      if (adminError) console.error("Could not verify administrator access for navigation.", adminError);
      else isAdmin = adminAccess === true;
    }
  }

  return (
    <>
      {user && <PresenceHeartbeat />}
      {user && !isAdmin && <SubscriptionApprovalToast />}
      <PublicNavbar signedIn={Boolean(user)} isAdmin={isAdmin} />
    </>
  );
}
