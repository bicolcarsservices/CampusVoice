import type { User } from "@supabase/supabase-js";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import PublicNavbar from "@/components/PublicNavbar";

export default async function Navbar() {
  let user: User | null = null;
  if (hasSupabaseConfig()) {
    const { data, error } = await createClient().auth.getUser();
    if (error) console.error("Could not verify the signed-in user for navigation.", error);
    user = data.user;
  }

  return <PublicNavbar signedIn={Boolean(user)} />;
}
