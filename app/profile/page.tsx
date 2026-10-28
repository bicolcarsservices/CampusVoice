import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) redirect("/login");

  const { data: profile, error } = await supabase.from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  if (!profile?.username) throw new Error("Your profile was not found. Please contact support.");

  redirect(`/profile/${encodeURIComponent(profile.username)}`);
}
