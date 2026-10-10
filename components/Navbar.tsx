import type { User } from "@supabase/supabase-js";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";
import PublicNavbar from "@/components/PublicNavbar";

export default async function Navbar() {
  let user: User | null = null;
  let isAdmin = false;
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { user: sessionUser } = await getAuthUser(supabase);
    user = sessionUser;
    if (user) {
      const { data: adminAccess, error: adminError } = await supabase.rpc("is_admin");
      if (adminError) console.error("Could not verify administrator access for navigation.", adminError);
      else isAdmin = adminAccess === true;
    }
  }

  return <PublicNavbar signedIn={Boolean(user)} isAdmin={isAdmin} />;
}
