import Image from "next/image";
import Link from "next/link";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  let signedIn = false;
  let hasStrikerPlan = false;

  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(`Could not verify login for games: ${authError.message}`);
    signedIn = Boolean(user);

    if (user) {
      const { data: subscription, error: subscriptionError } = await supabase.rpc("my_subscription");
      if (subscriptionError) throw new Error(`Could not verify game plan access: ${subscriptionError.message}`);
      hasStrikerPlan = ["basic", "premium"].includes(subscription?.status);
    }
  }

  const coinRushHref = signedIn
    ? "/games/campus-coin-rush"
    : `/login?next=${encodeURIComponent("/games/campus-coin-rush")}`;
  const coinRushRegisterHref = `/register?next=${encodeURIComponent("/games/campus-coin-rush")}`;
  const strikerHref = signedIn && hasStrikerPlan
    ? "/games/galactic-striker"
    : signedIn
      ? "/subscription"
      : `/login?next=${encodeURIComponent("/games/galactic-striker")}`;
  const strikerRegisterHref = `/register?next=${encodeURIComponent("/games/galactic-striker")}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="mx-auto max-w-2xl space-y-3 text-center">
        <p className="eyebrow">Play, earn, and explore</p>
        <h1 className="text-4xl font-extrabold">CampusVoice Games</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Explore the games before you sign in. Create an account or log in to play; Galactic Striker requires an active Basic or Premium plan.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <article className="card flex flex-col overflow-hidden p-0">
          <div className="relative aspect-[4/3] bg-slate-950">
            <Image
              src="/campus-coin-rush-promo.png"
              alt="Campus Coin Rush game preview and rewards"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="eyebrow">Arcade · Coins · Rewards</p>
            <h2 className="text-2xl font-bold">Campus Coin Rush</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">
              Play a quick campus arcade game, collect coins, unlock levels, and submit eligible load reward claims for review.
            </p>
            <Link href={coinRushHref} className="btn-primary mt-5 w-full">
              {signedIn ? "Play Campus Coin Rush" : "Log in to play"}
            </Link>
            {!signedIn && <Link href={coinRushRegisterHref} className="mt-2 text-center text-sm font-semibold text-brand">Create an account</Link>}
          </div>
        </article>

        <article className="card flex flex-col overflow-hidden p-0">
          <div className="relative aspect-[4/3] bg-slate-950">
            <Image
              src="/galactic-striker-promo.png"
              alt="Galactic Striker space shooter game preview"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="eyebrow">Space shooter · Crystal earnings</p>
            <h2 className="text-2xl font-bold">Galactic Striker</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">
              Take on the galaxy, collect crystals, and submit conversions for admin review. An active Basic or Premium subscription is required to play.
            </p>
            <Link href={strikerHref} className="btn-primary mt-5 w-full">
              {hasStrikerPlan ? "Play Galactic Striker" : signedIn ? "View plans to play" : "Log in to play"}
            </Link>
            {!signedIn && <Link href={strikerRegisterHref} className="mt-2 text-center text-sm font-semibold text-brand">Create an account</Link>}
          </div>
        </article>
      </div>
    </div>
  );
}
