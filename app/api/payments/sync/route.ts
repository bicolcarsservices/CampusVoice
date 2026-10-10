import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ intentId: z.string().trim().min(1).max(100) });
const API = "https://api.paymongo.com/v1";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("PayMongo status sync authentication failed", authError);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payment status request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });

  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("PayMongo status sync configuration is incomplete.");
    return NextResponse.json({ error: "Payment status sync is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: payment, error: paymentError } = await admin.from("paymongo_payments")
    .select("id,intent_id,status,amount_centavos,subscription_id")
    .eq("intent_id", parsed.data.intentId)
    .maybeSingle();
  if (paymentError) {
    console.error("Could not find PayMongo payment for status sync", paymentError);
    return NextResponse.json({ error: "Could not load this payment." }, { status: 500 });
  }
  if (!payment) return NextResponse.json({ error: "Payment was not found." }, { status: 404 });

  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("id,user_id,status,payment_method")
    .eq("id", payment.subscription_id)
    .maybeSingle();
  if (subscriptionError) {
    console.error("Could not load subscription for PayMongo status sync", subscriptionError);
    return NextResponse.json({ error: "Could not load this subscription." }, { status: 500 });
  }
  if (!subscription || subscription.payment_method !== "gcash") {
    return NextResponse.json({ error: "This is not a GCash subscription payment." }, { status: 404 });
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError) {
    console.error("Could not verify admin access for PayMongo status sync", adminError);
    return NextResponse.json({ error: "Could not verify access." }, { status: 500 });
  }
  if (subscription.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({
      status: payment.status,
      subscriptionStatus: subscription.status,
      result: `already_${payment.status}`,
    });
  }

  try {
    const response = await fetch(`${API}/payment_intents/${encodeURIComponent(payment.intent_id)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}` },
      cache: "no-store",
    });
    const providerResult: unknown = await response.json();
    if (!response.ok) {
      console.error("PayMongo could not return payment status", response.status);
      return NextResponse.json({ error: "PayMongo could not verify this payment. Try again later." }, { status: 502 });
    }

    const attributes = (providerResult as {
      data?: { attributes?: { status?: string; amount?: number; currency?: string } };
    }).data?.attributes;
    if (!attributes?.status) {
      console.error("PayMongo payment status response did not include a status.");
      return NextResponse.json({ error: "PayMongo returned an invalid payment status." }, { status: 502 });
    }
    if (attributes.status !== "succeeded" && attributes.status !== "cancelled") {
      return NextResponse.json({ status: "pending", providerStatus: attributes.status });
    }
    if (attributes.status === "succeeded" &&
        (!Number.isSafeInteger(attributes.amount) || !attributes.currency)) {
      console.error("PayMongo succeeded payment response did not include a valid amount and currency.");
      return NextResponse.json({ error: "PayMongo returned incomplete payment details." }, { status: 502 });
    }

    const { data: result, error: processError } = await admin.rpc("process_paymongo_payment", {
      p_intent_id: payment.intent_id,
      p_amount_centavos: attributes.amount ?? payment.amount_centavos,
      p_currency: attributes.currency ?? "PHP",
      p_paid: attributes.status === "succeeded",
    });
    if (processError) {
      console.error("Could not sync PayMongo payment status", processError);
      return NextResponse.json({ error: "Could not update the subscription status." }, { status: 500 });
    }
    return NextResponse.json({
      status: result,
      subscriptionStatus: result === "paid" ? "active" : subscription.status,
      result,
    });
  } catch (error) {
    console.error("PayMongo status sync failed", error);
    return NextResponse.json({ error: "Could not contact PayMongo. Try again later." }, { status: 502 });
  }
}
