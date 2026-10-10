import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buyDias"), packageId: z.enum(["p1", "p2", "p3", "p4"]) }),
  z.object({ action: z.literal("buySkin"), skinId: z.enum(["star", "rocket", "gem", "flame", "galaxy"]) }),
  z.object({ action: z.literal("equipSkin"), skinId: z.enum(["orb", "star", "rocket", "gem", "flame", "galaxy"]) }),
]);

async function getAccount(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: account, error: accountError }, { data: walletBalance, error: walletError }] = await Promise.all([
    supabase.from("wallet_game_accounts")
      .select("dias,owned_skins,equipped_skin")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("my_wallet_balance"),
  ]);
  if (accountError || walletError) {
    console.error("Could not load Campus Coin Rush account", accountError ?? walletError);
    return null;
  }
  return {
    dias: account?.dias ?? 0,
    ownedSkins: account?.owned_skins ?? ["orb"],
    equippedSkin: account?.equipped_skin ?? "orb",
    walletBalanceCentavos: walletBalance,
  };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Campus Coin Rush account authentication failed", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to use your CampusVoice wallet in the game." }, { status: 401 });

  const account = await getAccount(supabase, user.id);
  if (!account) return NextResponse.json({ error: "Could not load your game wallet." }, { status: 500 });
  return NextResponse.json(account, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Campus Coin Rush purchase authentication failed", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to use your CampusVoice wallet in the game." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid game wallet request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid game wallet request." }, { status: 400 });

  const { data, error: purchaseError } = parsed.data.action === "buyDias"
    ? await supabase.rpc("purchase_game_dias", { p_package_id: parsed.data.packageId })
    : parsed.data.action === "buySkin"
      ? await supabase.rpc("purchase_game_skin", { p_skin_id: parsed.data.skinId })
      : await supabase.rpc("equip_game_skin", { p_skin_id: parsed.data.skinId });
  if (purchaseError) {
    if (purchaseError.message.includes("INSUFFICIENT_BALANCE")) {
      return NextResponse.json({ error: "Not enough CampusVoice wallet balance. Top up your wallet first." }, { status: 409 });
    }
    if (purchaseError.message.includes("INSUFFICIENT_DIAS")) {
      return NextResponse.json({ error: "Not enough Dias for this character." }, { status: 409 });
    }
    if (purchaseError.message.includes("SKIN_ALREADY_OWNED")) {
      return NextResponse.json({ error: "You already own this character." }, { status: 409 });
    }
    if (purchaseError.message.includes("SKIN_NOT_OWNED")) {
      return NextResponse.json({ error: "You do not own this character." }, { status: 403 });
    }
    if (purchaseError.message.includes("ACCOUNT_NOT_ACTIVE")) {
      return NextResponse.json({ error: "Your CampusVoice account is not active." }, { status: 403 });
    }
    console.error("Campus Coin Rush wallet operation failed", purchaseError);
    return NextResponse.json({ error: "Could not update the game wallet. Please try again." }, { status: 500 });
  }

  const account = await getAccount(supabase, user.id);
  if (!account) return NextResponse.json({ error: "The purchase completed, but the updated balance could not be loaded. Refresh the game." }, { status: 500 });
  return NextResponse.json({ ...account, result: data }, { headers: { "Cache-Control": "no-store" } });
}
