import Link from "next/link";

export const dynamic = "force-dynamic";

function getMiniSoldierArenaUrl() {
  const configuredUrl = process.env.MINI_SOLDIER_ARENA_URL?.trim();
  const gameUrl = configuredUrl || (process.env.NODE_ENV === "production"
    ? "https://mini-soldier-arena-client.onrender.com"
    : "http://localhost:5173");

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
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">CampusVoice games · Free to play</p>
          <h1 className="text-3xl font-extrabold">Mini Soldier Arena</h1>
        </div>
        <Link href="/games" className="btn-ghost">All games</Link>
      </header>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Join a public battle or create a private room. On Android and other touch devices, switch to landscape before the match begins for the best controls.
      </p>
      <iframe
        title="Mini Soldier Arena multiplayer game"
        src={gameUrl}
        className="h-[82dvh] min-h-[280px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
        allow="fullscreen; orientation-lock; autoplay; clipboard-write; gamepad; microphone"
        allowFullScreen
      />
    </div>
  );
}
