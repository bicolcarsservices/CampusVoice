import { ONLINE_WINDOW_MS, isCurrentlyOnline } from "@/lib/social";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export async function getOnlineNowCount(supabase: ServerClient) {
  try {
    const { data, error } = await supabase.rpc("online_now_count");
    if (!error && data != null) return Number(data);

    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data: rows } = await supabase
      .from("user_presence")
      .select("last_seen_at")
      .gt("last_seen_at", cutoff);

    return (rows ?? []).filter((row) => isCurrentlyOnline(row.last_seen_at)).length;
  } catch (error) {
    console.error("Could not load online user count.", error);
    return 0;
  }
}
