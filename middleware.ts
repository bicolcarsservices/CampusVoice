import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/wall/new", "/profile", "/subscription", "/admin"];

function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return Boolean(
    url &&
    key &&
    !url.includes("YOUR-PROJECT") &&
    !key.includes("your-anon-key") &&
    url.startsWith("http")
  );
}

export async function middleware(req: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options as any));
        },
      },
    }
  );
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error || error.name === "AuthSessionMissingError" || error.message?.toLowerCase().includes("auth session missing")) {
      user = data.user;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const name = error instanceof Error ? error.name : "";
    if (name !== "AuthSessionMissingError" && !message.includes("auth session missing")) {
      throw error;
    }
  }
  if (!user && PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
