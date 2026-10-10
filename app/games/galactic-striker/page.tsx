import Link from "next/link";
import { redirect } from "next/navigation";
import GalacticStriker from "@/components/games/GalacticStriker";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GalacticStrikerPage() {
  const supabase = createClient();
  const [{ data: { user }, error: authError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("my_subscription"),
  ]);
  if (authError) throw new Error(`Could not verify your login: ${authError.message}`);
  if (!user) redirect("/login?next=%2Fgames%2Fgalactic-striker");
  if (subscriptionError) throw new Error(`Could not verify your subscription: ${subscriptionError.message}`);

  const gameEnabled = ["basic", "premium"].includes(subscription?.status);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">CampusVoice games{gameEnabled ? ` · ${subscription.status} plan` : ""}</p>
          <h1 className="text-3xl font-extrabold">Galactic Striker</h1>
          {subscription.expires_at && <p className="text-sm text-slate-500">Plan expires {new Date(subscription.expires_at).toLocaleDateString()}</p>}
        </div>
        <Link href="/wallet" className="btn-primary">Top up CampusVoice wallet</Link>
      </header>
      <p className="text-sm text-slate-500">
        {gameEnabled
          ? "Conversion requests and withdrawals require admin approval. Game crystals are reported by the browser and are not server-verified gameplay; review each conversion before approving it. Dias and CampusVoice wallet balance remain separate from game earnings."
          : "Your subscription has ended. Game crystals reset, but you can still view approved earnings and request a payout. Dias and CampusVoice wallet balance remain separate from game earnings."}
      </p>
      {!gameEnabled && <Link href="/subscription" className="btn-primary inline-flex">View subscription plans</Link>}
      <GalacticStriker gameEnabled={gameEnabled} />
    </div>
  );
}
