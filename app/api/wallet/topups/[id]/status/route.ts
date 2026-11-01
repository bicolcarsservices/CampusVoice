import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid top-up request." }, { status: 400 });

  const { supabase, user, error: authError } = await getAuthUser(createClient());
  if (authError) {
    console.error("Could not verify the current user for wallet top-up status.", authError);
    return NextResponse.json({ error: "Could not verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: request, error } = await supabase.from("wallet_topup_requests")
    .select("id,amount_centavos,received_centavos,fee_centavos,credited_centavos,status,payment_reference,review_note,created_at,reviewed_at")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not load wallet top-up status.", error);
    return NextResponse.json({ error: "Could not load top-up status." }, { status: 500 });
  }
  if (!request) return NextResponse.json({ error: "Top-up request not found." }, { status: 404 });

  return NextResponse.json(request, {
    headers: { "Cache-Control": "no-store" },
  });
}
