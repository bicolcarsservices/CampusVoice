import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const API = "https://api.paymongo.com/v1";
const requestSchema = z.object({ planId: z.string().uuid() });

async function paymongo(path: string, attributes: Record<string, unknown>) {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret) throw new Error("PayMongo is not configured.");

  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: { attributes } }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`PayMongo request failed: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data as {
    id: string;
    attributes: { client_key?: string; next_action?: { redirect?: { url?: string } } };
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("GCash checkout authentication failed", authError);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });

  const [{ data: profile, error: profileError }, { data: plan, error: planError }] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
    supabase.from("subscription_plans")
      .select("id,name,price_php,duration_days,is_active")
      .eq("id", parsed.data.planId).maybeSingle(),
  ]);
  if (profileError || planError) {
    console.error("GCash checkout database lookup failed", profileError ?? planError);
    return NextResponse.json({ error: "Could not verify the account or plan." }, { status: 500 });
  }
  if (profile?.status !== "active") {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }
  if (!plan || !plan.is_active || Number(plan.price_php) <= 0 || !plan.duration_days) {
    return NextResponse.json({ error: "This paid plan is unavailable for online payment." }, { status: 400 });
  }

  const amount = Math.round(Number(plan.price_php) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "This plan has an invalid price." }, { status: 400 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!process.env.PAYMONGO_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !siteUrl) {
    console.error("GCash checkout configuration is incomplete.");
    return NextResponse.json({ error: "Online payments are not configured yet." }, { status: 503 });
  }

  try {
    const returnUrl = new URL("/subscription", siteUrl);
    const intent = await paymongo("/payment_intents", {
      amount,
      currency: "PHP",
      payment_method_allowed: ["gcash"],
      capture_type: "automatic",
      description: `CampusVoice ${plan.name}`,
    });
    if (!intent.attributes.client_key) throw new Error("PayMongo returned no payment client key.");

    const attached = await paymongo(`/payment_intents/${intent.id}/attach`, {
      payment_method: (await paymongo("/payment_methods", { type: "gcash" })).id,
      client_key: intent.attributes.client_key,
      return_url: returnUrl.toString(),
    });
    const redirectUrl = attached.attributes.next_action?.redirect?.url;
    if (!redirectUrl || new URL(redirectUrl).protocol !== "https:") {
      throw new Error("PayMongo returned no secure GCash redirect URL.");
    }

    const admin = createAdminClient();
    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: "pending",
        payment_method: "gcash",
        payment_provider_id: intent.id,
      })
      .select("id")
      .single();
    if (subscriptionError) throw subscriptionError;

    const { error: paymentError } = await admin.from("paymongo_payments").insert({
      subscription_id: subscription.id,
      intent_id: intent.id,
      amount_centavos: amount,
      plan_duration_days: plan.duration_days,
      status: "pending",
    });
    if (paymentError) {
      const { error: cleanupError } = await admin.from("subscriptions").delete().eq("id", subscription.id);
      if (cleanupError) console.error("Could not clean up pending GCash subscription", cleanupError);
      throw paymentError;
    }

    return NextResponse.json({ redirectUrl });
  } catch (error) {
    console.error("GCash checkout failed", error);
    return NextResponse.json({ error: "Could not start the GCash payment. Please try again." }, { status: 502 });
  }
}
