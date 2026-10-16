import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import RegisterForm from "@/components/RegisterForm";
import AuthShell from "@/components/AuthShell";
import Link from "next/link";
import { authLogoSettings, getBrandAssetUrls } from "@/lib/branding";

export default async function RegisterPage({ searchParams }: { searchParams?: { next?: string } }) {
  const next = searchParams?.next?.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : undefined;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  if (!hasSupabaseConfig()) {
    return (
      <AuthShell title="Create your account" description="Join the conversation on your campus." footer={<>Already have an account? <Link href={loginHref}>Sign in</Link></>}>
        <h2 className="auth-form-title">Registration is unavailable</h2>
        <p>Supabase is not configured yet. Add your project URL and anon key to <code>.env.local</code> to enable registration.</p>
      </AuthShell>
    );
  }

  const supabase = createClient();
  const [{ data, error }, logos] = await Promise.all([
    supabase.from("schools").select("id,name").order("name"),
    getBrandAssetUrls(supabase, authLogoSettings.map((setting) => setting.key)),
  ]);
  if (error) throw new Error(`Could not load schools for registration: ${error.message}`);
  return (
    <AuthShell
      title="Create Account"
      description="Find your people. Share your campus story."
      footer={<>Already have an account? <Link href={loginHref}>Sign in</Link></>}
      heroLogoUrl={logos.get("auth_hero_logo")}
      formLogoUrl={logos.get("auth_form_logo")}
    >
      <RegisterForm schools={data ?? []} next={next} />
    </AuthShell>
  );
}
