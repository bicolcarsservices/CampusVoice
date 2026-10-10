import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CampusCoinRushPage() {
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error) throw new Error(`Could not verify your login: ${error.message}`);
  if (!user) redirect("/login?next=%2Fgames%2Fcampus-coin-rush");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">CampusVoice games</p>
          <h1 className="text-3xl font-extrabold">Campus Coin Rush</h1>
        </div>
        <a href="/wallet" className="btn-primary">Top up CampusVoice wallet</a>
      </header>
      <p className="text-sm text-slate-500">
        Dias purchases use your CampusVoice wallet. Maya top-ups are credited after admin verification. Load rewards are claims for manual admin review, not cash withdrawals.
      </p>
      <iframe
        title="Campus Coin Rush"
        src="/games/campus-coin-rush.html"
        className="h-[85vh] min-h-[720px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
        allow="fullscreen"
      />
    </div>
  );
}
