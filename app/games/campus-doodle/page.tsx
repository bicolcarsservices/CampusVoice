import Link from "next/link";

export const dynamic = "force-dynamic";

function getCampusDoodleUrl() {
  const configuredUrl = process.env.CAMPUS_DOODLE_URL?.trim();
  const gameUrl = configuredUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3101");
  if (!gameUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(gameUrl);
  } catch {
    throw new Error("CAMPUS_DOODLE_URL must be a valid absolute URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("CAMPUS_DOODLE_URL must use HTTP or HTTPS.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("CAMPUS_DOODLE_URL must not contain credentials.");
  }
  return parsedUrl.origin;
}

export default function CampusDoodlePage() {
  const gameUrl = getCampusDoodleUrl();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">CampusVoice games · Free to play</p>
          <h1 className="text-3xl font-extrabold">Campus Doodle</h1>
        </div>
        <Link href="/games" className="btn-ghost">All games</Link>
      </header>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Draw clues and guess with friends in real time. No CampusVoice subscription is required.
      </p>
      {gameUrl ? (
        <iframe
          title="Campus Doodle free multiplayer game"
          src={gameUrl}
          className="h-[82vh] min-h-[680px] w-full rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700"
          allow="fullscreen"
        />
      ) : (
        <aside role="status" className="card">
          <h2 className="font-bold">Campus Doodle is not connected yet</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Configure <code>CAMPUS_DOODLE_URL</code> with the HTTPS address of the deployed Campus Doodle service.
          </p>
          <Link href="/games" className="btn-primary mt-4">Back to games</Link>
        </aside>
      )}
    </div>
  );
}
