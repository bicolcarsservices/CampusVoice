import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function hasSupabaseConfig() {
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

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  }

  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options as any)); } catch {}
        },
      },
    }
  );
}

export function isMissingAuthSession(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  return name === "AuthSessionMissingError" || message.includes("auth session missing");
}

type AuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error: { message: string } | null }>;
  };
};

export async function getAuthUser(supabase?: AuthClient) {
  const client = supabase ?? createClient();
  try {
    const { data, error } = await client.auth.getUser();
    if (error && !isMissingAuthSession(error)) {
      return { supabase: client, user: null as User | null, error };
    }
    return { supabase: client, user: data.user ?? null, error: null };
  } catch (error) {
    if (isMissingAuthSession(error)) {
      return { supabase: client, user: null as User | null, error: null };
    }
    throw error;
  }
}
