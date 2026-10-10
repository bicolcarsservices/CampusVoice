import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const API = "https://api.paymongo.com/v1";
const requestSchema = z.object({ planId: z.string().uuid() });

class CheckoutError extends Error {
  constructor(
    message: string,
    readonly stage: string,
    readonly providerCode?: string,
    readonly providerStatus?: number,
  ) {
    super(message);
  }
}

async function paymongo(path: string, attributes: Record<string, unknown>, stage: string) {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret) throw new CheckoutError("PayMongo is not configured.", stage);

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { attributes } }),
    });
  } catch (cause) {
    throw new CheckoutError(
      cause instanceof Error ? cause.message : "Network request failed",
      stage,
    );
  }

  let body: {
    data?: {
      id?: string;
      attributes?: { client_key?: string; next_action?: { redirect?: { url?: string } } };
    };
    errors?: Array<{ code?: string; detail?: string }>;
  };
  try {
    body = await response.json();
  } catch {
    throw new CheckoutError("PayMongo returned an unreadable response.", stage, undefined, response.status);
  }
  if (!response.ok) {
    const providerError = body.errors?.[0];
    throw new CheckoutError(
      providerError?.detail ?? "PayMongo rejected the checkout request.",
      stage,
      providerError?.code,
      response.status,
    );
  }
  if (!body.data?.id || !body.data.attributes) {
    throw new CheckoutError("PayMongo returned an incomplete response.", stage, undefined, response.status);
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
  if (process.env.NODE_ENV === "production" && process.env.PAYMONGO_SECRET_KEY.startsWith("sk_test_")) {
    console.error("GCash checkout is configured with a PayMongo test key in production.");
    return NextResponse.json({
      error: "GCash checkout is in test mode. Configure PayMongo live credentials to accept real GCash payments.",
    }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: pendingSubscription, error: pendingError } = await admin
    .from("subscriptions")
    .select("payment_method")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) {
    console.error("Could not check for a pending subscription before GCash checkout", pendingError);
    return NextResponse.json({ error: "Could not verify your subscription request." }, { status: 500 });
  }
  if (pendingSubscription) {
    const message = pendingSubscription.payment_method === "gcash"
      ? "You already have a pending GCash checkout. Complete it or contact an administrator before starting another."
      : "You already have a pending subscription request. Wait for admin review or contact an administrator before starting GCash checkout.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    const intent = await paymongo("/payment_intents", {
      amount,
      currency: "PHP",
      payment_method_allowed: ["gcash"],
      capture_type: "automatic",
      description: `CampusVoice ${plan.name}`,
    }, "create_payment_intent");
    if (!intent.attributes.client_key) {
      throw new CheckoutError("PayMongo returned no payment client key.", "create_payment_intent");
    }

    const returnUrl = new URL("/subscription", siteUrl);
    returnUrl.searchParams.set("intent_id", intent.id);
    const paymentMethod = await paymongo("/payment_methods", { type: "gcash" }, "create_payment_method");
    const attached = await paymongo(`/payment_intents/${intent.id}/attach`, {
      payment_method: paymentMethod.id,
      client_key: intent.attributes.client_key,
      return_url: returnUrl.toString(),
    }, "attach_payment_method");
    const redirectUrl = attached.attributes.next_action?.redirect?.url;
    let secureRedirectUrl: URL;
    try {
      if (!redirectUrl) throw new Error("missing URL");
      secureRedirectUrl = new URL(redirectUrl);
    } catch {
      throw new CheckoutError("PayMongo returned no valid GCash redirect URL.", "attach_payment_method");
    }
    if (secureRedirectUrl.protocol !== "https:") {
      throw new CheckoutError("PayMongo returned a non-HTTPS GCash redirect URL.", "attach_payment_method");
    }

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
    if (subscriptionError) {
      console.error("Could not save GCash subscription after PayMongo checkout creation", {
        code: subscriptionError.code,
        message: subscriptionError.message,
      });
      throw new CheckoutError("Could not save the subscription request.", "save_subscription");
    }

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
      console.error("Could not save PayMongo payment record", {
        code: paymentError.code,
        message: paymentError.message,
      });
      throw new CheckoutError("Could not save the payment record.", "save_payment");
    }

    return NextResponse.json({ redirectUrl });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({
        error: "A pending subscription request already exists. Wait for admin review or contact an administrator before trying GCash again.",
      }, { status: 409 });
    }
    if (error instanceof CheckoutError) {
      console.error("GCash checkout failed", {
        stage: error.stage,
        providerStatus: error.providerStatus,
        providerCode: error.providerCode,
        message: error.message,
      });
      if (error.providerStatus === 401 || error.providerStatus === 403) {
        return NextResponse.json({
          error: "PayMongo rejected the API credentials. Check that PAYMONGO_SECRET_KEY is a valid secret key for the selected test or live mode.",
        }, { status: 502 });
      }
      if (error.providerCode?.toLowerCase().includes("payment_method")) {
        return NextResponse.json({
          error: "PayMongo could not use GCash for this account or checkout. Check that GCash is enabled for this PayMongo mode and review the server logs.",
        }, { status: 502 });
      }
      if (error.stage === "save_subscription" || error.stage === "save_payment") {
        return NextResponse.json({
          error: "PayMongo checkout started, but the subscription could not be saved. Check the server logs before trying again.",
        }, { status: 502 });
      }
      return NextResponse.json({
        error: `PayMongo checkout failed during ${error.stage.replaceAll("_", " ")}. Check the deployment logs for the provider error; do not share secret keys.`,
      }, { status: 502 });
    }
    console.error("GCash checkout failed unexpectedly", error);
    return NextResponse.json({
      error: "Could not start the GCash payment because of an unexpected server error. Check the deployment logs.",
    }, { status: 502 });
  }
}
