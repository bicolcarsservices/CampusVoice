# Campus Doodle

Standalone real-time multiplayer drawing & guessing game. Guests can play Quick Play and private rooms with a shared code without signing in; CampusVoice login is required for account-linked Coins and saved game features.
Node.js server (WebSocket) + plain HTML/CSS/JS client. Account-linked Coin balances are stored in Supabase; player cosmetics, match history, and the leaderboard are stored in `data/db.json`.

## Run locally from CampusVoice
```
npm install --prefix services/campus-doodle
npm run game:doodle       # http://localhost:3101
npm run game:doodle:test  # end-to-end tests (real server, real WebSocket bots)
```
Keep CampusVoice running in another terminal. The `/games/campus-doodle` page embeds this service. Use **Quick Play** to enter a public waiting lobby immediately, even when no other players are online. Other players can join the same lobby using Quick Play, with no room code or invite; the match starts automatically once at least two players are present. Quick Play has endless rounds and no Coins payout; it returns to a public lobby when fewer than two players remain. To play privately, create a room and invite friends with its 5-letter code; private matches keep their configured round limit and normal reward rules. Use the **Full screen** button while playing for an immersive layout; the game rearranges its player list, canvas, and chat for landscape screens.

Guests can join endless Quick Play or private rooms with a shared code from CampusVoice or directly from the standalone game URL without signing in. Direct invite links issue a short-lived signed guest ticket from the game service. Guest identities do not receive Coins or access to the leaderboard, shop, inventory, or history. Guests in private matches do not count toward Coin eligibility and cannot receive a payout. Run `supabase/campus-doodle.sql` in the Supabase SQL Editor to create the account-linked Coin wallet. Set `CAMPUS_DOODLE_AUTH_SECRET` in the root `.env.local`; `game:doodle` reads the shared secret and optional Supabase server credentials from that file. Coins earned in eligible private matches and spent in the shop are stored in Supabase by CampusVoice user ID, so they persist across browsers and game-service restarts. Player names, cosmetics, match history, and leaderboard data remain in the game service's local data file.

## Deploy publicly (Vercel + Render)
The Next.js CampusVoice app can run on Vercel, but the multiplayer game needs a separate Node service with WebSocket support. The repository-root `render.yaml` configures a free Render web service for the game.

1. Run `supabase/campus-doodle.sql` in the SQL Editor for the same Supabase project used by CampusVoice.
2. Push the project, including `render.yaml`, to GitHub.
3. Import the repository into Vercel and deploy CampusVoice from the repository root. Set the required Supabase environment variables from `.env.example`.
4. In Render, create a new Blueprint from the same GitHub repository. Render reads `render.yaml` and deploys the `campus-doodle` service. Set the prompted `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values from the same Supabase project used by CampusVoice. Generate a random secret of at least 32 characters for `CAMPUS_DOODLE_AUTH_SECRET`; configure that exact same secret in Render and Vercel. Never expose the service-role key in Vercel client variables or source control. Copy Render's public HTTPS URL (for example, `https://campus-doodle.onrender.com`).
5. In Vercel, set `CAMPUS_DOODLE_AUTH_SECRET` to the same value as Render. The CampusVoice game page defaults to `https://campus-doodle.onrender.com` in production. If the service URL changes, set `CAMPUS_DOODLE_URL` in Vercel to its public HTTPS URL, then redeploy the Vercel app.
6. Set `ALLOWED_ORIGINS` on Render to the exact CampusVoice origin `https://campus-voice-pi.vercel.app` (no path or trailing slash). It is included in the repository-root `render.yaml`. For a custom domain, add its origin as a comma-separated value too. Save the setting and redeploy/restart the game service.
7. Open `https://campus-voice-pi.vercel.app/games/campus-doodle` and test joining the same room from another device or browser.

The included Blueprint uses Render's free plan: the service may spin down when idle, so the first visit after inactivity can take a while. The authoritative Coin balance is stored in Supabase, not on Render's filesystem. Player cosmetics, match history, and leaderboard data use the service data file and may reset if Render's filesystem is cleared. A persistent disk can preserve those local records. Run only one game-service instance because live room state is held in memory.


## Rules (all enforced on the server, see `config.js`)
- States: WAITING -> STARTING -> DRAWING -> ROUND_RESULTS -> NEXT_ROUND. Private matches end at their configured round limit; public Quick Play keeps cycling turns until players leave.
- Guess points: 100-500 depending on time left; the artist earns 35% of each correct guesser's points.
- Ranking: score, then correct guesses, then join order (no shared ranks). Rewards: 1st 100, 2nd 70, 3rd 50, 4th 25 Coins.
- Private-match Coins need 3+ eligible signed-in players, a valid completed match, and presence for at least half the turns. Guests can participate in code rooms but do not earn Coins or count toward reward eligibility. Quick Play does not award Coins.
- Reward safety: one all-or-nothing transaction, unique key `skribbl:<match>:<player>`, match recorded once. Repeats of the same group (4+/24h) are held for review (see `flags` in db.json), and each player is capped at 6 rewarded matches/hour.
- Secret word is only sent to the artist (and to players after they guess it). Only the artist can draw. Rate limits and payload limits on everything.
- Shop prices/ownership/balance are checked on the server; each purchase uses an idempotency key and a transaction (no double charge, no negative balance).

## Notes / limitations
- Signed-in players are identified by their CampusVoice user ID; guests have a temporary browser-session identity. Quick Play places players into the public lobby; other players see only their display name and whether they are a guest. Account Coins remain attached to the CampusVoice account even after browser data is cleared.
- Guesses are not stored individually (only match results); no profanity filter on names/chat.
- Storage is a single JSON file, fine for a school/friends scale. Move to SQLite/Postgres if it grows.
