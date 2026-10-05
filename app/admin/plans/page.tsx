import AdminActionForm from "@/components/admin/AdminActionForm";
import { createClient } from "@/lib/supabase/server";
import { deletePlanFeature, savePlan, savePlanFeature } from "@/server/admin-actions";

export default async function AdminPlansPage() {
  const supabase = createClient();
  const [{ data: plans, error: plansError }, { data: features, error: featuresError }] = await Promise.all([
    supabase.from("subscription_plans")
      .select("id,code,name,description,price_php,duration_days,daily_post_limit,badge_label,is_active,sort_order")
      .order("sort_order"),
    supabase.from("subscription_features").select("id,plan_id,label,feature_key,sort_order").order("sort_order"),
  ]);
  if (plansError) throw new Error(`Could not load plans: ${plansError.message}`);
  if (featuresError) throw new Error(`Could not load features: ${featuresError.message}`);

  return (
    <section className="space-y-5">
      <div><h2 className="text-2xl font-bold">Plans and features</h2><p className="text-sm text-slate-500">Prices, duration, and limits are read from the database. Leave a posting limit blank for unlimited posts.</p></div>
      {(plans ?? []).map((plan) => (
        <article className="card space-y-5" key={plan.id}>
          <AdminActionForm action={savePlan} submitLabel="Save plan">
            <input type="hidden" name="plan_id" value={plan.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Plan name<input name="name" defaultValue={plan.name} maxLength={60} className="input mt-1" /></label>
              <label className="text-sm">Price (PHP)<input name="price_php" type="number" min="0" step="0.01" defaultValue={plan.price_php} className="input mt-1" /></label>
              <label className="text-sm">Duration in days (blank = no expiry)<input name="duration_days" type="number" min="1" defaultValue={plan.duration_days ?? ""} className="input mt-1" /></label>
              <label className="text-sm">Posts per day (blank = unlimited)<input name="daily_post_limit" type="number" min="0" defaultValue={plan.daily_post_limit ?? ""} className="input mt-1" /></label>
              <label className="text-sm sm:col-span-2">Description<textarea name="description" maxLength={300} defaultValue={plan.description ?? ""} className="input mt-1" /></label>
              <label className="text-sm">Plan status<select name="is_active" defaultValue={String(plan.is_active)} className="input mt-1"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
            </div>
          </AdminActionForm>
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="font-bold">Features for {plan.name}</h3>
            <ul className="mt-2 space-y-2">
              {(features ?? []).filter((feature) => feature.plan_id === plan.id).map((feature) => (
                <li key={feature.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                  <span>{feature.label}{feature.feature_key && <code className="ml-2 text-xs text-slate-500">{feature.feature_key}</code>}</span>
                  <AdminActionForm action={deletePlanFeature} submitLabel="Remove"><input type="hidden" name="feature_id" value={feature.id} /></AdminActionForm>
                </li>
              ))}
            </ul>
            <AdminActionForm action={savePlanFeature} submitLabel="Add feature">
              <input type="hidden" name="plan_id" value={plan.id} />
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
                <label className="text-sm">Label<input name="label" required maxLength={120} className="input mt-1" /></label>
                <label className="text-sm">Feature key (optional)<input name="feature_key" pattern="[a-z0-9_]+" maxLength={50} className="input mt-1" placeholder="bookmarks" /></label>
                <label className="text-sm">Order<input name="sort_order" type="number" min="0" defaultValue="99" className="input mt-1" /></label>
              </div>
            </AdminActionForm>
          </div>
        </article>
      ))}
    </section>
  );
}
