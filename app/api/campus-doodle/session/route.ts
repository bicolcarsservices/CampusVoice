import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const { user, error } = await getAuthUser(createClient());
  if (error) {
    console.error("Could not verify Campus Doodle login", error);
    return NextResponse.json({ error: "Could not verify your login." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Log in to play Campus Doodle." }, { status: 401 });

  const secret = process.env.CAMPUS_DOODLE_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("Campus Doodle authentication is not configured.");
    return NextResponse.json({ error: "Campus Doodle login is temporarily unavailable." }, { status: 503 });
  }

  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return NextResponse.json({ ticket: `${payload}.${signature}` }, {
    headers: { "Cache-Control": "no-store" },
  });
}
