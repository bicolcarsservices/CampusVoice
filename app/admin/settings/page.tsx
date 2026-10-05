import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { saveWebsiteSetting } from "@/server/admin-actions";

const settingInfo = [
  { key: "site_name", label: "Website name", fallback: "CampusVoice", type: "text" },
  { key: "tagline", label: "Tagline", fallback: "Your Voice. Your Space. Your Story.", type: "text" },
  { key: "free_daily_post_limit", label: "Free daily post limit", fallback: 2, type: "number" },
  { key: "require_post_approval", label: "Require post approval", fallback: false, type: "boolean" },
  { key: "maintenance_mode", label: "Maintenance mode", fallback: false, type: "boolean" },
] as const;

export default async function AdminSettingsPage() {
  const { data, error } = await createClient().from("website_settings").select("key,value");
  if (error) throw new Error(`Could not load website settings: ${error.message}`);
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Website settings</h2><p className="text-sm text-slate-500">Changes are stored in Supabase and audit-logged.</p></div>
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
