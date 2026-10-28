import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let guestId: string | null = null;
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "guestId" in body &&
        typeof body.guestId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.guestId)) {
      guestId = body.guestId.toLowerCase();
    }
  } catch {
    return NextResponse.json({ error: "Invalid Campus Doodle session request." }, { status: 400 });
  }

  const { user, error } = await getAuthUser(createClient());
  if (error) {
    console.error("Could not verify Campus Doodle login", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user && !guestId) return NextResponse.json({ error: "Could not start a guest game session." }, { status: 400 });

  const secret = process.env.CAMPUS_DOODLE_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("Campus Doodle authentication is not configured in the KanyaKanyaNa app environment.");
    return NextResponse.json({
      error: "Campus Doodle setup is incomplete. Add CAMPUS_DOODLE_AUTH_SECRET (32+ characters) to Vercel and Render, then redeploy.",
    }, { status: 503 });
  }

  const payload = Buffer.from(JSON.stringify({
    sub: user?.id ?? `guest:${guestId}`,
    ...(user ? {} : { guest: true }),
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return NextResponse.json({ ticket: `${payload}.${signature}` }, {
    headers: { "Cache-Control": "no-store" },
  });
}
