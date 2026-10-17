import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import PlanRequestForm from "@/components/community/PlanRequestForm";
import PlanTrialForm, { TrialStatus } from "@/components/community/PlanTrialForm";
import CancelSubscriptionForm from "@/components/community/CancelSubscriptionForm";
import PaymongoStatusSync from "@/components/community/PaymongoStatusSync";

export default async function SubscriptionPage({
  searchParams,
  compact = false,
}: {
  searchParams?: { intent_id?: string | string[] };
  compact?: boolean;
}) {
  const supabase = createClient();
  const [{ data: plans, error: plansError }, { data: features, error: featuresError }, { user }] = await Promise.all([
    supabase.from("subscription_plans")
      .select("id,code,name,description,price_php,duration_days,daily_post_limit,badge_label,is_active,sort_order")
      .eq("is_active", true).order("sort_order"),
    supabase.from("subscription_features").select("plan_id,label,feature_key,sort_order").order("sort_order"),
    getAuthUser(supabase),
  ]);
  const { data: subscription, error: subscriptionError } = user
    ? await supabase.rpc("my_subscription")
    : { data: null, error: null };
  if (plansError) throw new Error(`Could not load subscription plans: ${plansError.message}`);
  if (featuresError) throw new Error(`Could not load plan features: ${featuresError.message}`);
  if (subscriptionError) throw new Error(`Could not load subscription status: ${subscriptionError.message}`);
  const { data: trial, error: trialError } = user
    ? await supabase.from("subscription_trials").select("expires_at").eq("user_id", user.id).maybeSingle()
    : { data: null, error: null };
  const trialActive = Boolean(trial && new Date(trial.expires_at).getTime() > Date.now());
  const hasActiveSubscription = subscription?.status === "basic" || subscription?.status === "premium";

  return (
    <div className={`subscription-plan-picker mx-auto max-w-6xl ${compact ? "subscription-plan-picker-compact" : "space-y-8"}`}>
      <header className={`mx-auto text-center ${compact ? "max-w-3xl" : "max-w-2xl"}`}>
        <p className="eyebrow">Plans that grow with your voice</p>
        <h1 className={compact ? "text-3xl font-extrabold" : "text-4xl font-extrabold"}>Choose your CampusVoice plan</h1>
        {!compact && <p className="subscription-plan-explainer mt-3 text-slate-600 dark:text-slate-300">Eligible accounts may start one optional 7-day Basic or Premium trial. No payment or automatic charge. Paid plans use Maya QR and are activated after manual payment verification; plans do not renew automatically.</p>}
        {user && <p className={compact ? "mt-2 text-xs text-slate-500" : "mt-4 text-sm"}>Current plan: <strong className="capitalize">{subscription?.plan_name ?? "Free"}</strong></p>}
      </header>
      {!compact && subscription?.status === "expired" && (
        <aside className="card border-amber-300 bg-amber-50 text-amber-950">
          <h2 className="font-bold">Your subscription has expired</h2>
          <p className="mt-1 text-sm">Choose a plan below to subscribe again. You will review and complete a new payment.</p>
        </aside>
      )}
      {!compact && subscription?.status === "cancelled" && (
        <aside className="card">
          <h2 className="font-bold">Your subscription is cancelled</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose a plan below whenever you are ready to subscribe again.</p>
        </aside>
      )}
      {!compact && subscription?.status === "refunded" && (
        <aside className="card">
          <h2 className="font-bold">Your subscription payment was refunded</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose a plan below to start a new subscription.</p>
        </aside>
      )}
      {user && trialError && (
        <aside role="alert" className="card border-amber-300 bg-amber-50 text-amber-950">
          <h2 className="font-bold">The free trial is temporarily unavailable</h2>
          <p className="mt-1 text-sm">We could not verify trial eligibility. Paid plans remain available. If this is a new setup, run <code>supabase/subscription-trials.sql</code> in the Supabase SQL Editor.</p>
        </aside>
      )}
      {typeof searchParams?.intent_id === "string" && (
        <aside className="card space-y-2">
          <p className="font-semibold">Checking your GCash payment</p>
          <PaymongoStatusSync intentId={searchParams.intent_id} autoSync />
        </aside>
      )}
      <div className={`subscription-plan-grid grid items-stretch ${compact ? "grid-cols-3 gap-3" : "gap-5 md:grid-cols-3"}`}>
        {(plans ?? []).map((plan) => {
          const planFeatures = (features ?? []).filter((feature) => feature.plan_id === plan.id);
          const featured = plan.code === "premium";
          return (
            <article key={plan.id} className={`card flex flex-col ${compact ? "plan-picker-card" : "mobile-plan-picker-card"} ${featured ? "border-sky-400 ring-2 ring-sky-100 dark:border-sky-500 dark:ring-sky-900" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                {plan.badge_label && <span className="tag">{plan.badge_label}</span>}
              </div>
              {!compact && <p className="mt-2 min-h-12 text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>}
              {compact && <p className="plan-picker-description mt-1 text-xs text-slate-500">{plan.description}</p>}
              <p className={compact ? "mt-3 text-3xl font-extrabold" : "mt-5 text-4xl font-extrabold"}>₱{Number(plan.price_php).toLocaleString("en-PH")}</p>
              <p className="text-sm text-slate-500">
                {plan.duration_days ? `${plan.duration_days} ${plan.duration_days === 1 ? "day" : "days"}` : "No expiry"}
              </p>
              {!compact && <p className="mt-3 text-sm font-semibold">
                {plan.daily_post_limit == null ? "Unlimited posts" : `${plan.daily_post_limit} posts per day`}
              </p>}
              {!compact && <ul className="my-5 flex-1 space-y-2 text-sm">
                {planFeatures.map((feature) => <li key={`${feature.plan_id}-${feature.sort_order}`} className="flex gap-2"><span className="text-brand">✓</span>{feature.label}</li>)}
              </ul>}
              {plan.code === "free" ? (
                <Link href={user ? "/wall" : "/register"} className="btn-ghost w-full">{user ? "Continue with Free" : "Get started"}</Link>
              ) : user && trialActive && trial ? (
                <TrialStatus text={`Your trial is active until ${new Date(trial.expires_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}.`} />
              ) : user && subscription?.status === "pending" ? (
                <TrialStatus text="Resolve your pending subscription request before starting a trial." />
              ) : user && !trialError && !trial && !hasActiveSubscription && (plan.code === "basic" || plan.code === "premium") ? (
                <PlanTrialForm planCode={plan.code} />
              ) : user ? (
                <PlanRequestForm
                  planId={plan.id}
                  planName={plan.name}
                  description={plan.description}
                  pricePhp={Number(plan.price_php)}
                  durationDays={plan.duration_days}
                  dailyPostLimit={plan.daily_post_limit}
                  features={planFeatures.map((feature) => feature.label)}
                />
              ) : (
                <Link href="/login" className="btn-primary w-full">Log in to request</Link>
              )}
            </article>
          );
        })}
      </div>
      {!compact && subscription?.subscription_id && (
        <aside className="card">
          <p className="text-sm text-slate-600 dark:text-slate-300">You may cancel your active plan at any time. Cancellation ends access immediately.</p>
          <CancelSubscriptionForm subscriptionId={subscription.subscription_id} />
        </aside>
      )}
      {!compact && <p className="text-center text-xs text-slate-500">Maya payments are verified manually by an administrator before a subscription is activated. Plan prices and features can change; confirmed subscriptions follow their recorded terms.</p>}
    </div>
  );
}
