import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PlanRequestForm from "@/components/community/PlanRequestForm";
import CancelSubscriptionForm from "@/components/community/CancelSubscriptionForm";
import PaymongoStatusSync from "@/components/community/PaymongoStatusSync";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: { intent_id?: string | string[] };
}) {
  const supabase = createClient();
  const [{ data: plans, error: plansError }, { data: features, error: featuresError },
    { data: { user } }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("subscription_plans")
      .select("id,code,name,description,price_php,duration_days,daily_post_limit,badge_label,is_active,sort_order")
      .eq("is_active", true).order("sort_order"),
    supabase.from("subscription_features").select("plan_id,label,feature_key,sort_order").order("sort_order"),
    supabase.auth.getUser(),
    supabase.rpc("my_subscription"),
  ]);
  if (plansError) throw new Error(`Could not load subscription plans: ${plansError.message}`);
  if (featuresError) throw new Error(`Could not load plan features: ${featuresError.message}`);
  if (subscriptionError) throw new Error(`Could not load subscription status: ${subscriptionError.message}`);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Plans that grow with your voice</p>
        <h1 className="text-4xl font-extrabold">Choose your CampusVoice plan</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Choose a plan, pay using the Maya QR code, and submit your payment reference. An administrator will verify your payment before activating your plan. Expired plans are not charged automatically; subscribe again whenever you are ready.</p>
        {user && <p className="mt-4 text-sm">Current plan: <strong className="capitalize">{subscription?.plan_name ?? "Free"}</strong></p>}
      </header>
      {subscription?.status === "expired" && (
        <aside className="card border-amber-300 bg-amber-50 text-amber-950">
          <h2 className="font-bold">Your subscription has expired</h2>
          <p className="mt-1 text-sm">Choose a plan below to subscribe again. You will review and complete a new payment.</p>
        </aside>
      )}
      {subscription?.status === "cancelled" && (
        <aside className="card">
          <h2 className="font-bold">Your subscription is cancelled</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose a plan below whenever you are ready to subscribe again.</p>
        </aside>
      )}
      {subscription?.status === "refunded" && (
        <aside className="card">
          <h2 className="font-bold">Your subscription payment was refunded</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose a plan below to start a new subscription.</p>
        </aside>
      )}
      {typeof searchParams?.intent_id === "string" && (
        <aside className="card space-y-2">
          <p className="font-semibold">Checking your GCash payment</p>
          <PaymongoStatusSync intentId={searchParams.intent_id} autoSync />
        </aside>
      )}
      {subscription?.subscription_id && (
        <aside className="card">
          <p className="text-sm text-slate-600 dark:text-slate-300">You may cancel your active plan at any time. Cancellation ends access immediately.</p>
          <CancelSubscriptionForm subscriptionId={subscription.subscription_id} />
        </aside>
      )}
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {(plans ?? []).map((plan) => {
          const planFeatures = (features ?? []).filter((feature) => feature.plan_id === plan.id);
          const featured = plan.code === "premium";
          return (
            <article key={plan.id} className={`card flex flex-col ${featured ? "border-violet-400 ring-2 ring-violet-100 dark:ring-violet-900" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                {plan.badge_label && <span className="tag">{plan.badge_label}</span>}
              </div>
              <p className="mt-2 min-h-12 text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>
              <p className="mt-5 text-4xl font-extrabold">₱{Number(plan.price_php).toLocaleString("en-PH")}</p>
              <p className="text-sm text-slate-500">{plan.duration_days ? `${plan.duration_days} days` : "No expiry"}</p>
              <p className="mt-3 text-sm font-semibold">
                {plan.daily_post_limit == null ? "Unlimited posts" : `${plan.daily_post_limit} posts per day`}
              </p>
              <ul className="my-5 flex-1 space-y-2 text-sm">
                {planFeatures.map((feature) => <li key={`${feature.plan_id}-${feature.sort_order}`} className="flex gap-2"><span className="text-brand">✓</span>{feature.label}</li>)}
              </ul>
              {plan.code === "free" ? (
                <Link href={user ? "/wall" : "/register"} className="btn-ghost w-full">{user ? "Continue with Free" : "Get started"}</Link>
              ) : user ? (
                <PlanRequestForm
                  planId={plan.id}
                  planName={plan.name}
                  pricePhp={Number(plan.price_php)}
                />
              ) : (
                <Link href="/login" className="btn-primary w-full">Log in to request</Link>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">Maya payments are verified manually by an administrator before a subscription is activated. Plan prices and features can change; confirmed subscriptions follow their recorded terms.</p>
    </div>
  );
}
