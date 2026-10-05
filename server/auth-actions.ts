"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { resolveSchoolName } from "@/lib/schools";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(60),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 letters, numbers or _"),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
  school_name: z.string().trim().max(100).optional().default(""),
  grade_level: z.string().trim().min(1).max(30),
});

function getAuthCallbackUrl() {
  const origin = headers().get("origin");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin || "http://localhost:3000";
  return new URL("/auth/callback", siteUrl).toString();
}

function getEmailAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email rate limit") || normalized.includes("rate limit exceeded")) {
    return "Naabot na ang limit ng Supabase sa pagpapadala ng email. Para makapag-register nang walang verification email, i-off ang Confirm email sa Supabase Dashboard → Authentication → Sign In / Providers → Email. Para manatiling naka-on ang verification, maghintay na ma-reset ang limit o mag-configure ng sariling SMTP provider.";
  }
  if (normalized.includes("username")) return "Username already taken.";
  return message;
}

export async function login(_: unknown, fd: FormData) {
  if (!hasSupabaseConfig()) {
    return { error: "Supabase is not configured yet. Add your project URL and anon key to .env.local." };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Wrong email or password." };
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError) {
    return { error: `You are signed in, but administrator access could not be checked: ${adminError.message}` };
  }
  redirect(isAdmin ? "/admin" : "/wall");
}

export async function register(_: unknown, fd: FormData) {
  if (!hasSupabaseConfig()) {
    return { error: "Supabase is not configured yet. Add your project URL and anon key to .env.local." };
  }

  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, ...meta } = parsed.data;
  const supabase = createClient();
  const { data: schools, error: schoolsError } = meta.school_name
    ? await supabase.from("schools").select("id,name").eq("is_active", true)
    : { data: [], error: null };
  if (schoolsError) return { error: `Could not check the school name: ${schoolsError.message}` };
  const school = resolveSchoolName(meta.school_name, schools ?? []);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: meta.full_name,
        username: meta.username,
        grade_level: meta.grade_level,
        school_id: school.schoolId,
        school_name: school.schoolName,
      },
      emailRedirectTo: getAuthCallbackUrl(),
    },
  });
  if (error) return { error: getEmailAuthError(error.message) };
  if (!data.session) redirect("/login?registered=1");
  redirect("/wall");
}

export async function resendConfirmation(_: unknown, fd: FormData) {
  if (!hasSupabaseConfig()) {
    return { error: "Supabase is not configured yet. Add your project URL and anon key to .env.local." };
  }

  const parsed = z.string().email().safeParse(fd.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const { error } = await createClient().auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: getAuthCallbackUrl() },
  });
  if (error) return { error: getEmailAuthError(error.message) };
  return { success: "If the account needs confirmation, a new email has been sent." };
}

export async function requestPasswordReset(_: unknown, fd: FormData) {
  if (!hasSupabaseConfig()) {
    return { error: "Supabase is not configured yet. Add your project URL and anon key to .env.local." };
  }
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || headers().get("origin") || "http://localhost:3000";
  const redirectTo = new URL("/auth/callback?next=/reset-password", siteUrl).toString();
  const { error } = await createClient().auth.resetPasswordForEmail(email.data, { redirectTo });
  if (error) return { error: error.message };
  return { success: "If an account exists for that email, a password reset link has been sent." };
}

export async function updatePassword(_: unknown, fd: FormData) {
  if (!hasSupabaseConfig()) {
    return { error: "Supabase is not configured yet. Add your project URL and anon key to .env.local." };
  }
  const password = z.string().min(8, "Password must be at least 8 characters.").safeParse(fd.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const { error } = await createClient().auth.updateUser({ password: password.data });
  if (error) return { error: `Could not update password: ${error.message}` };
  redirect("/wall");
}

export async function logout() {
  if (!hasSupabaseConfig()) {
    redirect("/");
  }

  await createClient().auth.signOut();
  redirect("/");
}
