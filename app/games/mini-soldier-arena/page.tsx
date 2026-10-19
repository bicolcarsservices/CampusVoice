import Link from "next/link";

export const dynamic = "force-dynamic";

function getMiniSoldierArenaUrl() {
  const configuredUrl = process.env.MINI_SOLDIER_ARENA_URL?.trim();
  const gameUrl = configuredUrl || (process.env.NODE_ENV === "production"
    ? null
    : "http://localhost:5175");
  if (!gameUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(gameUrl);
  } catch {
    throw new Error("MINI_SOLDIER_ARENA_URL must be a valid absolute URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("MINI_SOLDIER_ARENA_URL must use HTTP or HTTPS.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("MINI_SOLDIER_ARENA_URL must not contain credentials.");
  }
  return parsedUrl.origin;
}

export default function MiniSoldierArenaPage() {
  const gameUrl = getMiniSoldierArenaUrl();

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">CampusVoice games · Free to play</p>
          <h1 className="text-3xl font-extrabold">Mini Soldier Arena</h1>
        </div>
        <Link href="/games" className="btn-ghost">All games</Link>
      </header>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Jetpack into real-time 2D battles, play in teams, or create a private room for friends. No CampusVoice subscription is required.
      </p>
      {gameUrl ? (
        <iframe
          title="Mini Soldier Arena multiplayer game"
          src={gameUrl}
          className="h-[82vh] min-h-[680px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
          allow="fullscreen; autoplay; gamepad; web-share"
        />
      ) : (
        <aside role="status" className="card">
          <h2 className="font-bold">Mini Soldier Arena is not connected yet</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Set <code>MINI_SOLDIER_ARENA_URL</code> to the deployed game client URL. The game client also needs its
            <code> VITE_SERVER_URL</code> set to the multiplayer server&apos;s secure WebSocket address.
          </p>
          <Link href="/games" className="btn-primary mt-4">Back to games</Link>
        </aside>
      )}
    </div>
  );
}
