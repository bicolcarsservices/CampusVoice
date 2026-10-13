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

## Deploy
Needs a separate host/service that keeps a Node process running (Render, Railway, Fly.io, or a VPS). **Vercel serverless will not work** for the WebSocket server.
- Set the service root directory to `services/campus-doodle`, install with `npm install`, and use `npm start`.
- Set `CAMPUS_DOODLE_URL` on the CampusVoice web app to the public HTTPS URL of this service.
- Set `ALLOWED_ORIGINS` on this service to the exact CampusVoice web origin (for example `https://campusvoice.example.com`) so the game can be embedded and its WebSocket accepts the app origin.
- Attach a persistent disk/volume and set `DATA_FILE=/path/db.json`; without it, Coins reset on redeploy.
- Use HTTPS; the client switches to `wss://` automatically.
- Runs as ONE instance (room state lives in memory).

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
