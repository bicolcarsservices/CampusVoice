import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { authLogoSettingKeys, getBrandAssetUrls } from "@/lib/branding";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; registered?: string; next?: string };
}) {
  if (!hasSupabaseConfig()) return <LoginForm searchParams={searchParams} />;
  const logos = await getBrandAssetUrls(
    createClient(),
    authLogoSettingKeys,
  );
  return (
    <LoginForm
      searchParams={searchParams}
      heroLogoUrl={logos.get("auth_hero_logo") ?? logos.get("auth_form_logo")}
    />
  );
}
