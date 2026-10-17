import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { saveBrandLogo, saveWebsiteSetting } from "@/server/admin-actions";
import { authLogoSettingKeys, authLogoSettings, gameLogoSettings, publicStorageUrl } from "@/lib/branding";

const settingInfo = [
  { key: "site_name", label: "Website name", fallback: "CampusVoice", type: "text" },
  { key: "tagline", label: "Tagline", fallback: "Your Voice. Your Space. Your Story.", type: "text" },
  { key: "free_daily_post_limit", label: "Free daily post limit", fallback: 2, type: "number" },
  { key: "require_post_approval", label: "Require post approval", fallback: false, type: "boolean" },
  { key: "maintenance_mode", label: "Maintenance mode", fallback: false, type: "boolean" },
] as const;

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const settingKeys = [
    "site_name",
    "tagline",
    "free_daily_post_limit",
    "require_post_approval",
    "maintenance_mode",
    ...authLogoSettingKeys,
    ...gameLogoSettings.map((setting) => setting.key),
  ];
  const { data, error } = await supabase
    .from("website_settings")
    .select("key,value")
    .in("key", settingKeys);
  if (error) throw new Error(`Could not load website settings: ${error.message}`);
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const logoSettings = [
    ...authLogoSettings.map((setting) => ({ ...setting, bucket: "brand-assets" })),
    ...gameLogoSettings.map((setting) => ({ ...setting, bucket: "game-logos" })),
  ];

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Website settings</h2><p className="text-sm text-slate-500">Changes are stored in Supabase and audit-logged.</p></div>
      <div className="card space-y-5">
        <div>
          <h3 className="text-xl font-bold">Brand and game logos</h3>
          <p className="mt-1 text-sm text-slate-500">Upload a JPG, PNG, or WebP image up to 2 MB. Logos appear on the login and registration pages or in the Games catalog.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {logoSettings.map((setting) => {
            const storedPath = values.get(setting.key);
            const logoUrl = publicStorageUrl(
              supabase,
              setting.bucket,
              typeof storedPath === "string" ? storedPath : null,
            );
            return (
              <article className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" key={setting.key}>
                <div className="mb-3 flex min-h-16 items-center gap-3">
                  {logoUrl
                    ? <img src={logoUrl} alt={`${setting.label} preview`} className="h-16 w-16 rounded-xl bg-slate-100 object-contain p-1 dark:bg-slate-800" />
                    : <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-100 text-2xl text-slate-400 dark:bg-slate-800">+</div>}
                  <h4 className="font-semibold">{setting.label}</h4>
                </div>
                <AdminActionForm action={saveBrandLogo} submitLabel="Upload logo">
                  <input type="hidden" name="key" value={setting.key} />
                  <label className="block text-sm">Choose image
                    <input name="logo" type="file" accept="image/jpeg,image/png,image/webp" required className="input mt-1" />
                  </label>
                </AdminActionForm>
              </article>
            );
          })}
        </div>
      </div>
      {settingInfo.map((setting) => {
        const value = values.get(setting.key) ?? setting.fallback;
        const inputValue = typeof value === "string" || typeof value === "number" ? String(value) : String(value);
        return (
          <article className="card" key={setting.key}>
            <AdminActionForm action={saveWebsiteSetting} submitLabel="Save setting">
              <input type="hidden" name="key" value={setting.key} />
              <label className="block text-sm font-medium">{setting.label}
                {setting.type === "boolean" ? (
                  <select name="value" defaultValue={inputValue} className="input mt-1"><option value="true">Enabled</option><option value="false">Disabled</option></select>
                ) : (
                  <input name="value" type={setting.type} min={setting.type === "number" ? 0 : undefined} max={setting.type === "number" ? 100 : undefined} defaultValue={inputValue} className="input mt-1" />
                )}
              </label>
            </AdminActionForm>
          </article>
        );
      })}
    </section>
  );
}
