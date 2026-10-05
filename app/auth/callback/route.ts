import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code && hasSupabaseConfig()) {
    const { error } = await createClient().auth.exchangeCodeForSession(code);
    if (!error) {
      const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/wall";
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=verification", origin));
}
