import Image from "next/image";
import Link from "next/link";
import { createClient, getAuthUser, hasSupabaseConfig } from "@/lib/supabase/server";
import { getBrandAssetUrls } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  let signedIn = false;
  let hasStrikerPlan = false;
  let gameLogos = new Map<string, string>([
    ["game_logo_mini_soldier_arena", "/mini-soldier-arena-logo.png"],
  ]);

  if (hasSupabaseConfig()) {
    const supabase = createClient();
    const { user, error: authError } = await getAuthUser(supabase);
    if (authError) throw new Error(`Could not verify login for games: ${authError.message}`);
    signedIn = Boolean(user);
    gameLogos = await getBrandAssetUrls(supabase, [
      "game_logo_campus_doodle",
      "game_logo_campus_coin_rush",
      "game_logo_galactic_striker",
    ]);
    gameLogos.set("game_logo_mini_soldier_arena", "/mini-soldier-arena-logo.png");

    if (user) {
      const { data: subscription, error: subscriptionError } = await supabase.rpc("my_subscription");
      if (subscriptionError) throw new Error(`Could not verify game plan access: ${subscriptionError.message}`);
      hasStrikerPlan = ["basic", "premium"].includes(subscription?.status);
    }
  }

  const games = [
    {
      id: "campus-doodle",
      title: "Campus Doodle",
      tagline: "Draw. Guess. Laugh together.",
      category: "MULTIPLAYER · DRAW & GUESS",
      description: "Draw clues, guess with friends, and play together in real time. Free to play; no CampusVoice subscription required.",
      href: "/games/campus-doodle",
      cta: "Play free",
      registerHref: undefined,
      logoKey: "game_logo_campus_doodle",
      icon: "✎",
      visual: "doodle",
    },
    {
      id: "campus-coin-rush",
      title: "Campus Coin Rush",
      tagline: "Collect coins. Unlock rewards.",
      category: "ARCADE · COINS & REWARDS",
      description: "Play a quick campus arcade game, collect coins, unlock levels, and submit eligible load reward claims for review.",
      href: signedIn ? "/games/campus-coin-rush" : `/login?next=${encodeURIComponent("/games/campus-coin-rush")}`,
      cta: signedIn ? "Play now" : "Log in to play",
      registerHref: `/register?next=${encodeURIComponent("/games/campus-coin-rush")}`,
      logoKey: "game_logo_campus_coin_rush",
      icon: "₵",
      visual: "coin-rush",
    },
    {
      id: "galactic-striker",
      title: "Galactic Striker",
      tagline: "Take on the galaxy.",
      category: "SPACE SHOOTER · CRYSTAL EARNINGS",
      description: "Take on the galaxy, collect crystals, and submit conversions for admin review. An active Basic or Premium plan is required.",
      href: signedIn
        ? hasStrikerPlan ? "/games/galactic-striker" : "/subscription"
        : `/login?next=${encodeURIComponent("/games/galactic-striker")}`,
      cta: hasStrikerPlan ? "Play now" : signedIn ? "View plans" : "Log in to play",
      registerHref: `/register?next=${encodeURIComponent("/games/galactic-striker")}`,
      logoKey: "game_logo_galactic_striker",
      icon: "✦",
      visual: "striker",
    },
    {
      id: "mini-soldier-arena",
      title: "Mini Soldier Arena",
      tagline: "Team up. Lock in. Take the arena.",
      category: "MULTIPLAYER · ONLINE SHOOTER",
      description: "Jump into public battles or create a private room. Play free-for-all or team matches with friends.",
      href: "/games/mini-soldier-arena",
      cta: "Play now",
      registerHref: undefined,
      logoKey: "game_logo_mini_soldier_arena",
      icon: "⚔",
      visual: "mini-soldier",
    },
  ];

  return (
    <div className="games-arcade">
      <header className="games-arcade-hero">
        <div className="games-arcade-hero-copy">
          <p className="games-arcade-eyebrow"><span>✦</span> CAMPUS ARCADE</p>
          <h1>Play your<br /><span>next favorite.</span></h1>
          <p>Quick games, friendly competition, and campus rewards. Pick a game and jump in.</p>
          <a className="games-arcade-cta" href="#all-games">Explore games <span aria-hidden="true">↓</span></a>
        </div>
        <div className="games-arcade-orb games-arcade-orb-one" aria-hidden="true" />
        <div className="games-arcade-orb games-arcade-orb-two" aria-hidden="true" />
        <div className="games-arcade-hero-badge" aria-hidden="true">
          <span>CV</span><i>ARCADE</i><b>✦</b>
        </div>
        <div className="games-arcade-hero-foot"><span>01</span><i /><span>PLAY · EARN · REPEAT</span></div>
      </header>

      <section className="games-catalog" id="all-games">
        <div className="games-catalog-heading">
          <div>
            <p className="games-arcade-eyebrow">YOUR NEXT LEVEL</p>
            <h2>All games</h2>
          </div>
          <span className="games-catalog-count">{games.length} GAMES</span>
        </div>

        <div className="games-arcade-grid">
          {games.map((game, index) => (
            <article className={`game-arcade-card game-arcade-card-${game.visual}`} key={game.id}>
              <div className="game-arcade-art">
                {game.visual === "coin-rush" ? (
                  <Image
                    src="/campus-coin-rush-promo.png"
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="game-arcade-promo"
                    priority={index === 0}
                  />
                ) : game.visual === "striker" ? (
                  <Image
                    src="/galactic-striker-promo.png"
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="game-arcade-promo"
                  />
                ) : game.visual === "mini-soldier" ? (
                  <Image
                    src="/mini-soldier-arena-promo.jpg"
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="game-arcade-promo"
                  />
                ) : (
                  <div className="doodle-art" aria-hidden="true">
                    <svg viewBox="0 0 180 120">
                      <path d="M24 78c18-5 21-35 38-30 11 3-8 38 3 40 10 2 18-35 30-32 12 3-4 26 7 28 9 2 19-20 31-18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="6" />
                      <path d="m119 22 25 25m-31-18 25 25-38 38-24 6 6-24z" fill="none" stroke="#38BDF8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
                      <circle cx="38" cy="34" r="5" fill="#7DD3FC" /><circle cx="155" cy="75" r="4" fill="#38BDF8" />
                    </svg>
                  </div>
                )}
                <span className="game-arcade-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="game-arcade-logo">
                  {gameLogos.get(game.logoKey)
                    ? <img src={gameLogos.get(game.logoKey)} alt={`${game.title} logo`} />
                    : <span aria-hidden="true">{game.icon}</span>}
                </div>
                <span className="game-arcade-play-mark" aria-hidden="true">↗</span>
              </div>
              <div className="game-arcade-info">
                <p className="game-arcade-category">{game.category}</p>
                <h3>{game.title}</h3>
                <p className="game-arcade-tagline">{game.tagline}</p>
                <p className="game-arcade-description">{game.description}</p>
                <Link href={game.href} className="game-arcade-link">
                  {game.cta}<span aria-hidden="true">→</span>
                </Link>
                {game.registerHref && !signedIn && (
                  <Link href={game.registerHref} className="game-arcade-register">Create an account</Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="games-arcade-footer">
        <span>MADE FOR THE CAMPUS COMMUNITY</span><span>PLAY FAIR · HAVE FUN</span>
      </footer>
    </div>
  );
}
