import Image from "next/image";
import Link from "next/link";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  let signedIn = false;
  let hasStrikerPlan = false;

  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { user, error: authError } = await getAuthUser(supabase);
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
          Campus Doodle is free to play. Campus Coin Rush requires an account, and Galactic Striker requires an active Basic or Premium plan.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <article className="card flex flex-col overflow-hidden p-0">
          <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-gradient-to-br from-violet-950 via-slate-900 to-indigo-950">
            <svg aria-hidden="true" viewBox="0 0 160 120" className="h-32 w-40 text-violet-200">
              <path d="M27 74c15-3 22-27 34-24 9 2-7 32 2 34 8 2 16-29 26-27 9 2-3 22 5 24 7 2 16-16 25-16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="m99 27 21 21m-26-16 21 21-33 33-21 5 5-21z" fill="none" stroke="#c4b5fd" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              <circle cx="35" cy="37" r="4" fill="#a78bfa" />
              <circle cx="133" cy="78" r="3" fill="#c4b5fd" />
            </svg>
            <span className="absolute bottom-4 rounded-full border border-violet-300/30 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-violet-100">FREE TO PLAY</span>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="eyebrow">Multiplayer · Draw · Guess</p>
            <h2 className="text-2xl font-bold">Campus Doodle</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">
              Draw clues, guess with friends, and play together in real time. Free to play; no CampusVoice subscription required.
            </p>
            <Link href="/games/campus-doodle" className="btn-primary mt-5 w-full">Play Campus Doodle Free</Link>
          </div>
        </article>

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
