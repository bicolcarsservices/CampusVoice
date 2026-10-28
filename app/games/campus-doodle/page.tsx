import Link from "next/link";
import CampusDoodleFrame from "@/components/games/CampusDoodleFrame";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getCampusDoodleUrl() {
  const configuredUrl = process.env.CAMPUS_DOODLE_URL?.trim();
  const gameUrl = configuredUrl || (process.env.NODE_ENV === "production"
    ? "https://campus-doodle.onrender.com"
    : "http://localhost:3101");
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

export default async function CampusDoodlePage() {
  const { user, error } = await getAuthUser(createClient());
  if (error) throw new Error(`Could not verify your login: ${error.message}`);

  const gameUrl = getCampusDoodleUrl();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">KanyaKanyaNa games · Free to play</p>
          <h1 className="text-3xl font-extrabold">Campus Doodle</h1>
        </div>
        <Link href="/games" className="btn-ghost">All games</Link>
      </header>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {user
          ? "Draw clues and guess with friends in real time. Play Quick Play or join private rooms with a code. KanyaKanyaNa accounts can earn and use Coins and access saved game features."
          : "Play Quick Play with random players or join a private room with a shared code—no login needed. Only KanyaKanyaNa accounts can earn or use Coins and access saved game features."}
      </p>
      {!user && <Link href="/login?next=%2Fgames%2Fcampus-doodle" className="btn-primary inline-flex">Log in to KanyaKanyaNa</Link>}
      {gameUrl ? (
        <CampusDoodleFrame gameUrl={gameUrl} />
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
