# Campus Doodle

Standalone real-time multiplayer drawing & guessing game. No Supabase or CampusVoice account is required.
Node.js server (WebSocket) + plain HTML/CSS/JS client. Coins, inventory, matches and the leaderboard are stored in `data/db.json`.

## Run locally from CampusVoice
```
npm install --prefix services/campus-doodle
npm run game:doodle       # http://localhost:3101
npm run game:doodle:test  # end-to-end tests (real server, real WebSocket bots)
```
Keep CampusVoice running in another terminal. The `/games/campus-doodle` page embeds this service. Use **Quick Play** to enter a public waiting lobby immediately, even when no other players are online. Other players can join the same lobby using Quick Play, with no room code or invite; the match starts automatically once at least two players are present. To play privately, create a room and invite friends with its 5-letter code. Use the **Full screen** button while playing for an immersive layout; the game rearranges its player list, canvas, and chat for landscape screens.

## Deploy publicly (Vercel + Render)
The Next.js CampusVoice app can run on Vercel, but the multiplayer game needs a separate Node service with WebSocket support. The repository-root `render.yaml` configures a free Render web service for the game.

1. Push the project, including `render.yaml`, to GitHub.
2. Import the repository into Vercel and deploy CampusVoice from the repository root. Set the required Supabase environment variables from `.env.example`.
3. In Render, create a new Blueprint from the same GitHub repository. Render reads `render.yaml` and deploys the `campus-doodle` service. Copy its public HTTPS URL (for example, `https://campus-doodle.onrender.com`).
4. The CampusVoice game page defaults to `https://campus-doodle.onrender.com` in production. If the service URL changes, set `CAMPUS_DOODLE_URL` in Vercel to its public HTTPS URL, then redeploy the Vercel app.
5. Set `ALLOWED_ORIGINS` on Render to the exact CampusVoice origin `https://campus-voice-pi.vercel.app` (no path or trailing slash). It is included in the repository-root `render.yaml`. For a custom domain, add its origin as a comma-separated value too. Save the setting and redeploy/restart the game service.
6. Open `https://campus-voice-pi.vercel.app/games/campus-doodle` and test joining the same room from another device or browser.

The included Blueprint uses Render's free plan: the service may spin down when idle, so the first visit after inactivity can take a while. Its filesystem is temporary, so player Coins and leaderboard data can reset when the service restarts or redeploys. For persistent data, use a paid Render plan with a persistent disk mounted at `/var/data` and set `DATA_FILE=/var/data/db.json`. Run only one game-service instance because live room state is held in memory.


## Rules (all enforced on the server, see `config.js`)
- States: WAITING -> STARTING -> DRAWING -> ROUND_RESULTS -> NEXT_ROUND -> MATCH_FINISHED. Everyone draws once per round.
- Guess points: 100-500 depending on time left; the artist earns 35% of each correct guesser's points.
- Ranking: score, then correct guesses, then join order (no shared ranks). Rewards: 1st 100, 2nd 70, 3rd 50, 4th 25 Coins.
- Coins need 3+ eligible players, the match to be valid, and being present for at least half the turns. Fewer players = friendly match, no Coins.
- Reward safety: one all-or-nothing transaction, unique key `skribbl:<match>:<player>`, match recorded once. Repeats of the same group (4+/24h) are held for review (see `flags` in db.json), and each player is capped at 6 rewarded matches/hour.
- Secret word is only sent to the artist (and to players after they guess it). Only the artist can draw. Rate limits and payload limits on everything.
- Shop prices/ownership/balance are checked on the server; each purchase uses an idempotency key and a transaction (no double charge, no negative balance).

## Notes / limitations
- Players are identified by a random token in the browser (no CampusVoice account). Quick Play places players into the public lobby; other players see only the game name. Clearing site data loses that player's Coins.
- Guesses are not stored individually (only match results); no profanity filter on names/chat.
- Storage is a single JSON file, fine for a school/friends scale. Move to SQLite/Postgres if it grows.
