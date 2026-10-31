import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getAuthUser } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname);
  }),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Push notifications are not configured on the server yet." }, { status: 503 });
  }
  const { user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) return NextResponse.json({ error: "Please log in to enable notifications." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("push_subscriptions").upsert({
      endpoint: parsed.data.endpoint,
      user_id: user.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    }, { onConflict: "endpoint" });
    if (error) {
      console.error("Could not save push subscription.", error);
      return NextResponse.json({ error: "Could not save push settings. Run supabase/web-push.sql and try again." }, { status: 500 });
    }
  } catch (error) {
    console.error("Push subscription setup is unavailable.", error);
    return NextResponse.json({ error: "Push notifications are not configured on the server yet." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { user, error: authError } = await getAuthUser(createClient());
  if (authError || !user) return NextResponse.json({ error: "Please log in to update notifications." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const endpoint = z.string().url().max(4096).safeParse(
    typeof body === "object" && body !== null && "endpoint" in body ? body.endpoint : null,
  );
  if (!endpoint.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("push_subscriptions")
      .delete().eq("endpoint", endpoint.data).eq("user_id", user.id);
    if (error) {
      console.error("Could not remove push subscription.", error);
      return NextResponse.json({ error: "Could not turn off push notifications." }, { status: 500 });
    }
  } catch (error) {
    console.error("Push subscription setup is unavailable.", error);
    return NextResponse.json({ error: "Push notifications are not configured on the server yet." }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
