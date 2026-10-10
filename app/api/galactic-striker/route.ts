import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("convert"), crystals: z.union([z.literal(25000), z.literal(60000)]) }),
  z.object({ action: z.literal("buyItem"), itemId: z.enum([
    "nova", "comet", "titan", "aegis", "spectre", "laser", "rapid", "spread",
    "cannon", "missile", "plasma", "cy", "mg", "lm", "gd", "sk0", "sk1",
    "sk2", "sk3", "fx0", "fx1", "fx2",
  ]) }),
  z.object({ action: z.literal("equipItem"), itemId: z.enum([
    "nova", "comet", "titan", "aegis", "spectre", "laser", "rapid", "spread",
    "cannon", "missile", "plasma", "cy", "mg", "lm", "gd", "sk0", "sk1",
    "sk2", "sk3", "fx0", "fx1", "fx2",
  ]) }),
  z.object({ action: z.literal("upgradeWeapon"), itemId: z.enum([
    "laser", "rapid", "spread", "cannon", "missile", "plasma",
  ]) }),
  z.object({
    action: z.literal("withdraw"),
    amountCentavos: z.number().int().min(100).max(10000000),
    payoutMethod: z.enum(["GCash", "Maya"]),
    accountName: z.string().trim().min(2).max(100),
    accountEmail: z.string().trim().email().max(254),
    accountNumber: z.string().trim().min(4).max(100),
  }),
]);

export async function GET(request: Request) {
  const supabase = createClient();
  const { user, error: authError } = await getAuthUser(supabase);
  if (authError) {
    console.error("Could not load Galactic Striker access", authError);
    return NextResponse.json({ error: "Could not verify your account or subscription." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to use Galactic Striker." }, { status: 401 });

  const { data: subscription, error: subscriptionError } = await supabase.rpc("my_subscription");
  if (subscriptionError) {
    console.error("Could not load Galactic Striker access", subscriptionError);
    return NextResponse.json({ error: "Could not verify your account or subscription." }, { status: 500 });
  }
  const gameAccessAvailable = ["basic", "premium"].includes(subscription?.status);
  if (new URL(request.url).searchParams.get("mode") === "game" && !gameAccessAvailable) {
    return NextResponse.json({ error: "An active Basic or Premium plan is required to play Galactic Striker." }, { status: 403 });
  }

  const [{ data: earnings, error: earningsError }, { data: conversions, error: conversionsError },
    { data: withdrawals, error: withdrawalsError }] = await Promise.all([
    supabase.from("galactic_earnings_wallets").select("balance_centavos").eq("user_id", user.id).maybeSingle(),
    supabase.from("galactic_conversion_requests")
      .select("id,subscription_id,crystals,plan_code,amount_centavos,status,review_note,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("galactic_withdrawal_requests")
      .select("id,amount_centavos,vat_centavos,payout_centavos,payout_method,status,review_note,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (earningsError || conversionsError || withdrawalsError) {
    console.error("Could not load Galactic Striker wallet", earningsError ?? conversionsError ?? withdrawalsError);
    return NextResponse.json({ error: "Could not load Galactic Striker earnings." }, { status: 500 });
  }

  let gameAccount = null;
  if (gameAccessAvailable) {
    const { data, error } = await supabase.rpc("my_galactic_game_inventory");
    if (error) {
      console.error("Could not load Galactic Striker inventory", error);
      return NextResponse.json({ error: "Could not load Galactic Striker inventory." }, { status: 500 });
    }
    gameAccount = data;
  }

  return NextResponse.json({
    subscription,
    gameAccessAvailable,
    earningsBalanceCentavos: earnings?.balance_centavos ?? 0,
    dias: gameAccount?.dias ?? 0,
    inventory: gameAccount?.inventory ?? [],
    conversions,
    withdrawals,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { user, error: authError } = await getAuthUser(supabase);
  if (authError) {
    console.error("Galactic Striker request authentication failed", authError);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to use Galactic Striker earnings." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid Galactic Striker request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter valid conversion or payout details." }, { status: 400 });

  const result = parsed.data.action === "convert"
    ? await supabase.rpc("request_galactic_conversion", { p_crystals: parsed.data.crystals })
    : parsed.data.action === "buyItem"
      ? await supabase.rpc("purchase_galactic_item", { p_item_id: parsed.data.itemId })
      : parsed.data.action === "equipItem"
        ? await supabase.rpc("equip_galactic_item", { p_item_id: parsed.data.itemId })
        : parsed.data.action === "upgradeWeapon"
          ? await supabase.rpc("upgrade_galactic_weapon", { p_item_id: parsed.data.itemId })
          : await supabase.rpc("request_galactic_withdrawal", {
      p_amount_centavos: parsed.data.amountCentavos,
      p_payout_method: parsed.data.payoutMethod,
      p_account_name: parsed.data.accountName,
      p_account_email: parsed.data.accountEmail.toLowerCase(),
      p_account_number: parsed.data.accountNumber,
    });
  if (result.error) {
    const message = result.error.message;
    if (message.includes("ACCOUNT_NOT_ACTIVE")) {
      return NextResponse.json({ error: "Your CampusVoice account is not active." }, { status: 403 });
    }
    if (message.includes("NOT_AUTHENTICATED")) {
      return NextResponse.json({ error: "Log in again before submitting this request." }, { status: 401 });
    }
    if (message.includes("INVALID_AMOUNT") || message.includes("INVALID_PAYOUT_METHOD") ||
        message.includes("INVALID_PAYOUT_DETAILS") || message.includes("INVALID_GAME_ITEM")) {
      return NextResponse.json({ error: "Check the request details and try again." }, { status: 400 });
    }
    if (message.includes("INSUFFICIENT_EARNINGS")) {
      return NextResponse.json({ error: "Your available Galactic Striker earnings are too low for this withdrawal." }, { status: 409 });
    }
    if (message.includes("INVALID_CONVERSION")) {
      return NextResponse.json({ error: "Choose a supported crystal conversion." }, { status: 400 });
    }
    if (message.includes("ITEM_ALREADY_OWNED")) {
      return NextResponse.json({ error: "You already own this item." }, { status: 409 });
    }
    if (message.includes("ITEM_NOT_OWNED")) {
      return NextResponse.json({ error: "You do not own this item." }, { status: 403 });
    }
    if (message.includes("INSUFFICIENT_DIAS")) {
      return NextResponse.json({ error: "Not enough Dias for this purchase or upgrade." }, { status: 409 });
    }
    if (message.includes("MAX_UPGRADE_LEVEL")) {
      return NextResponse.json({ error: "This weapon is already fully upgraded." }, { status: 409 });
    }
    if (message.includes("SUBSCRIPTION_REQUIRED")) {
      return NextResponse.json({ error: "An active Basic or Premium plan is required to use this game." }, { status: 403 });
    }
    if (result.error.code === "23505") {
      return NextResponse.json({ error: "You already have a pending crystal conversion request." }, { status: 409 });
    }
    console.error("Galactic Striker request failed", result.error);
    return NextResponse.json({ error: "Could not submit the request. Please try again." }, { status: 500 });
  }

  if (parsed.data.action === "buyItem" || parsed.data.action === "equipItem" || parsed.data.action === "upgradeWeapon") {
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({
    requestId: result.data,
    success: parsed.data.action === "convert"
      ? "Crystal conversion submitted for admin review. Earnings are credited only after approval."
      : "Withdrawal submitted for admin review. The 10% VAT is deducted from the payout.",
  }, { status: 201 });
}
