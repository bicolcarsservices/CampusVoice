"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export async function setNotificationPreference(enabled: boolean): Promise<{ error?: string }> {
  if (typeof enabled !== "boolean") return { error: "Choose whether to receive in-app notifications." };
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) return { error: "Please log in to update your settings." };

  const { error } = await supabase.rpc("set_my_notification_preference", { p_enabled: enabled });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return { error: "Run supabase/admin-support.sql in Supabase to enable notification preferences." };
    }
    if (error.message.includes("ACCOUNT_NOT_ACTIVE")) return { error: "Your account is not active." };
    return { error: `Could not save notification settings: ${error.message}` };
  }
  revalidatePath("/profile");
  return {};
}
