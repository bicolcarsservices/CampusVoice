# Campus Doodle

Standalone real-time multiplayer drawing & guessing game. No Supabase or CampusVoice account is required.
Node.js server (WebSocket) + plain HTML/CSS/JS client. Coins, inventory, matches and the leaderboard are stored in `data/db.json`.

## Run locally from CampusVoice
```
npm install --prefix services/campus-doodle
npm run game:doodle       # http://localhost:3101
npm run game:doodle:test  # end-to-end tests (real server, real WebSocket bots)
```
Keep CampusVoice running in another terminal. The `/games/campus-doodle` page embeds this service. Open multiple game tabs or devices, create a room in one, and join with the 5-letter code in the others.

## Free local AI practice
The Practice vs AI page provides 1–6 rounds and a selectable 30, 45, 60, 80, 100, or 120-second timer for each drawing turn. Players type free-text guesses instead of choosing from multiple-choice answers. When drawing, players pick one word from three options; the AI guesses the resulting drawing without being given those options. Offered words are not repeated during a practice session. The service includes a bank of 1,000 unique, easy-to-draw words.

AI runs locally with Ollama. It does not need an API key and does not charge per request. The computer running the Doodle service must have Ollama running and a vision model installed. This uses local CPU/GPU memory and performance depends on the computer.

1. Install Ollama for Windows from [ollama.com/download](https://ollama.com/download) and start the Ollama app.
2. In PowerShell, download the default vision model once:
```powershell
ollama pull qwen2.5vl:3b
```
3. Start the game service:
```powershell
npm run game:doodle
```
Ollama's default local API address is `http://127.0.0.1:11434`. To use another installed vision model or address, set `OLLAMA_VISION_MODEL` or `OLLAMA_BASE_URL` in the same PowerShell window before starting the service. Without Ollama or the model, the practice page tells you what is missing while multiplayer remains usable. Online hosting requires Ollama running on the same server as the Doodle service; the local PC's Ollama cannot be reached by an unrelated cloud server.

```powershell
$env:OLLAMA_VISION_MODEL = "your-installed-vision-model"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
npm run game:doodle
```

## Deploy publicly (Vercel + Render)
The Next.js CampusVoice app can run on Vercel, but the multiplayer game needs a separate Node service with WebSocket support. The repository-root `render.yaml` configures a free Render web service for the game.

1. Push the project, including `render.yaml`, to GitHub.
2. Import the repository into Vercel and deploy CampusVoice from the repository root. Set the required Supabase environment variables from `.env.example`.
3. In Render, create a new Blueprint from the same GitHub repository. Render reads `render.yaml` and deploys the `campus-doodle` service. Copy its public HTTPS URL (for example, `https://campus-doodle.onrender.com`).
4. In Vercel project settings, add `CAMPUS_DOODLE_URL` with that Render URL, then redeploy the Vercel app.
5. In the Render service's environment settings, set `ALLOWED_ORIGINS` to the exact public CampusVoice origin, such as `https://your-app.vercel.app` (no path or trailing slash). For a custom domain, include each origin as a comma-separated value, for example `https://your-app.vercel.app,https://campusvoice.example.com`. Save the change and redeploy/restart the game service.
6. Open `https://your-app.vercel.app/games/campus-doodle` and test joining the same room from another device or browser.

The included Blueprint uses Render's free plan: the service may spin down when idle, so the first visit after inactivity can take a while. Its filesystem is temporary, so player Coins and leaderboard data can reset when the service restarts or redeploys. For persistent data, use a paid Render plan with a persistent disk mounted at `/var/data` and set `DATA_FILE=/var/data/db.json`. Run only one game-service instance because live room state is held in memory.

Online AI practice is separate from multiplayer and needs Ollama with a vision model running on the same host as the game service. It is not enabled by this basic deployment setup.

## Rules (all enforced on the server, see `config.js`)
- States: WAITING -> STARTING -> DRAWING -> ROUND_RESULTS -> NEXT_ROUND -> MATCH_FINISHED. Everyone draws once per round.
- Guess points: 100-500 depending on time left; the artist earns 35% of each correct guesser's points.
- Ranking: score, then correct guesses, then join order (no shared ranks). Rewards: 1st 100, 2nd 70, 3rd 50, 4th 25 Coins.
- Coins need 3+ eligible players, the match to be valid, and being present for at least half the turns. Fewer players = friendly match, no Coins.
- Reward safety: one all-or-nothing transaction, unique key `skribbl:<match>:<player>`, match recorded once. Repeats of the same group (4+/24h) are held for review (see `flags` in db.json), and each player is capped at 6 rewarded matches/hour.
- Secret word is only sent to the artist (and to players after they guess it). Only the artist can draw. Rate limits and payload limits on everything.
- Shop prices/ownership/balance are checked on the server; each purchase uses an idempotency key and a transaction (no double charge, no negative balance).

## Notes / limitations
- Players are identified by a random token in the browser (no accounts). Clearing site data loses that player's Coins.
- Guesses are not stored individually (only match results); no profanity filter on names/chat.
- Storage is a single JSON file, fine for a school/friends scale. Move to SQLite/Postgres if it grows.
