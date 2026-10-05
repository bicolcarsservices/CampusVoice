import { createClient } from "@/lib/supabase/server";
import AdminActionForm from "@/components/admin/AdminActionForm";
import { adminActivateSubscription } from "@/server/admin-actions";

export default async function AdminSubscriptionsPage() {
  const { data: requests, error } = await createClient().from("subscriptions")
    .select("id,user_id,status,created_at,payment_method,payment_reference,subscription_plans(code,name),profiles(username,display_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load subscription requests: ${error.message}`);

  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl font-bold">Subscription requests</h2><p className="text-sm text-slate-500">Manual review only. This dashboard does not process payments.</p></div>
      {!requests?.length && <p className="card text-slate-500">No subscription requests yet.</p>}
      {(requests ?? []).map((request) => {
        const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
        const plan = Array.isArray(request.subscription_plans) ? request.subscription_plans[0] : request.subscription_plans;
        return (
          <article className="card space-y-3" key={request.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-bold">{profile?.display_name ?? profile?.username ?? request.user_id} · {plan?.name ?? "Plan"}</h3>
              <span className="tag capitalize">{request.status}</span>
            </div>
            <p className="text-sm text-slate-500">Requested {new Date(request.created_at).toLocaleString()} · {request.payment_method ?? "manual"}{request.payment_reference ? ` · Reference: ${request.payment_reference}` : ""}</p>
            {request.status === "pending" && (
              <AdminActionForm action={adminActivateSubscription} submitLabel="Verify and activate">
                <input type="hidden" name="request_id" value={request.id} />
                <input type="hidden" name="user_id" value={request.user_id} />
                <label className="block text-sm">Plan to activate
                  <select name="plan_code" className="input mt-1" defaultValue={plan?.code === "premium" ? "premium" : "basic"}>
                    <option value="basic">Basic</option><option value="premium">Premium</option>
                  </select>
                </label>
                <label className="block text-sm">Verification note
                  <input name="reason" maxLength={500} className="input mt-1" />
                </label>
              </AdminActionForm>
            )}
          </article>
        );
      })}
    </section>
  );
}
