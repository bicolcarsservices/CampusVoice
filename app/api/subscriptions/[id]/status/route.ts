import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError) {
    console.error("Could not verify the current user for subscription status.", authError);
    return NextResponse.json({ error: "Could not verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: subscription, error } = await supabase.from("subscriptions")
    .select("id,status")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not load subscription payment status.", error);
    return NextResponse.json({ error: "Could not load payment status." }, { status: 500 });
  }
  if (!subscription) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

  return NextResponse.json({ status: subscription.status }, {
    headers: { "Cache-Control": "no-store" },
  });
}
