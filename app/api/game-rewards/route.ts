import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  rewardId: z.enum(["load10", "gosurf59"]),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^[+0-9() -]{7,30}$/),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Campus Coin Rush reward history authentication failed", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to view reward claims." }, { status: 401 });

  const { data: claims, error: claimsError } = await supabase.from("game_reward_claims")
    .select("id,reward_code,status,created_at,review_note")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (claimsError) {
    console.error("Could not load Campus Coin Rush reward claims", claimsError);
    return NextResponse.json({ error: "Could not load reward claims." }, { status: 500 });
  }
  return NextResponse.json({ claims }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Campus Coin Rush reward claim authentication failed", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to submit a reward claim." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid reward claim." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, phone number, and reward." }, { status: 400 });

  const { data: claimId, error: claimError } = await supabase.rpc("request_game_reward", {
    p_reward_code: parsed.data.rewardId,
    p_recipient_name: parsed.data.name,
    p_recipient_email: parsed.data.email.toLowerCase(),
    p_recipient_phone: parsed.data.phone,
  });
  if (claimError) {
    if (claimError.code === "23505" || claimError.message.includes("duplicate key")) {
      return NextResponse.json({ error: "You already have a pending claim for this reward." }, { status: 409 });
    }
    if (claimError.message.includes("ACCOUNT_NOT_ACTIVE")) {
      return NextResponse.json({ error: "Your CampusVoice account is not active." }, { status: 403 });
    }
    console.error("Could not submit Campus Coin Rush reward claim", claimError);
    return NextResponse.json({ error: "Could not submit your reward claim. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    claimId,
    success: "Claim submitted for admin review. Claims are processed manually around 9 PM; no load is sent automatically.",
  }, { status: 201 });
}
