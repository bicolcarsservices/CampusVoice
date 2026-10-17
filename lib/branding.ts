import type { createClient } from "@/lib/supabase/server";

export const campusVoicePublicUrl = "https://campus-voice-pi.vercel.app/";

export const authLogoSettings = [
  { key: "auth_hero_logo", label: "Login and registration logo" },
] as const;

export const authLogoSettingKeys = ["auth_hero_logo", "auth_form_logo"] as const;

export const gameLogoSettings = [
  { key: "game_logo_campus_doodle", label: "Campus Doodle logo" },
  { key: "game_logo_campus_coin_rush", label: "Campus Coin Rush logo" },
  { key: "game_logo_galactic_striker", label: "Galactic Striker logo" },
] as const;

type SupabaseServerClient = ReturnType<typeof createClient>;

export function publicStorageUrl(
  supabase: SupabaseServerClient,
  bucket: string,
  path: string | null | undefined,
) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function getBrandAssetUrls(
  supabase: SupabaseServerClient,
  keys: readonly string[],
) {
  if (!keys.length) return new Map<string, string>();
  const { data, error } = await supabase
    .from("website_settings")
    .select("key,value")
    .in("key", [...keys]);
  if (error) throw new Error(`Could not load brand assets: ${error.message}`);

  const urls = new Map<string, string>();
  for (const setting of data ?? []) {
    if (typeof setting.value !== "string") continue;
    const bucket = setting.key.startsWith("game_logo_") ? "game-logos" : "brand-assets";
    const url = publicStorageUrl(supabase, bucket, setting.value);
    if (url) urls.set(setting.key, url);
  }
  return urls;
}
