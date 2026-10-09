import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function verifySignature(rawBody: string, header: string | null) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!webhookSecret || !secretKey || !header) return false;

  const parts = Object.fromEntries(header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? ["", ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
  const signature = parts[secretKey.startsWith("sk_test") ? "te" : "li"];
  if (!parts.t || !signature || !/^[a-f0-9]+$/i.test(signature)) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${parts.t}.${rawBody}`).digest();
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!process.env.PAYMONGO_WEBHOOK_SECRET || !process.env.PAYMONGO_SECRET_KEY) {
    console.error("PayMongo webhook configuration is incomplete.");
    return new NextResponse("Webhook is not configured.", { status: 503 });
  }
  if (!verifySignature(rawBody, request.headers.get("paymongo-signature"))) {
    return new NextResponse("Bad signature.", { status: 401 });
  }

  let event: {
    data?: {
      attributes?: {
        type?: string;
        data?: { attributes?: { payment_intent_id?: string; amount?: number; currency?: string } };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid event body.", { status: 400 });
  }

  const attributes = event.data?.attributes;
  if (attributes?.type !== "payment.paid" && attributes?.type !== "payment.failed") {
    return NextResponse.json({ ok: true });
  }
  const payment = attributes.data?.attributes;
  if (!payment?.payment_intent_id || !Number.isSafeInteger(payment.amount) || !payment.currency) {
    return new NextResponse("Invalid payment event.", { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("process_paymongo_payment", {
    p_intent_id: payment.payment_intent_id,
    p_amount_centavos: payment.amount,
    p_currency: payment.currency,
    p_paid: attributes.type === "payment.paid",
  });
  if (error) {
    console.error("Could not process PayMongo webhook", error);
    return new NextResponse("Could not process payment event.", { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
