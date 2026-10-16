import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError) {
    console.error("Could not verify the current user for subscription approval notifications.", authError);
    return NextResponse.json({ error: "Could not verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: notification, error } = await supabase.from("notifications")
    .select("id,message,link")
    .eq("type", "subscription_active")
    .eq("is_read", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Could not load subscription approval notifications.", error);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
  if (!notification) return NextResponse.json({ notification: null });

  const { data: updated, error: updateError } = await supabase.from("notifications")
    .update({ is_read: true })
    .eq("id", notification.id)
    .eq("is_read", false)
    .select("id");
  if (updateError) {
    console.error("Could not mark subscription approval notification as read.", updateError);
    return NextResponse.json({ error: "Could not update notification." }, { status: 500 });
  }
  if (!updated?.length) return NextResponse.json({ notification: null });

  return NextResponse.json({ notification });
}
