"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(60),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 letters, numbers or _"),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
  school_id: z.string().uuid("Choose a school"),
  grade_level: z.string().trim().min(1).max(30),
});

export async function login(_: unknown, fd: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Wrong email or password." };
  redirect("/wall");
}

export async function register(_: unknown, fd: FormData) {
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, ...meta } = parsed.data;
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta } });
  if (error) return { error: error.message.includes("username") ? "Username already taken." : error.message };
  if (!data.session) redirect("/login?registered=1"); // email confirmation enabled
  redirect("/wall");
}

export async function logout() {
  await createClient().auth.signOut();
  redirect("/");
}
