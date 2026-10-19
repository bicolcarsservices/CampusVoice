# Mini Soldier Arena

Online 2D jetpack shooter. Phaser 3 + TypeScript + Vite (game) and Node.js + Colyseus (multiplayer server).

    server/   multiplayer server (port 2567)      client/   the game (port 5173)

## Deploy with the CampusVoice Render Blueprint

This game is included in the CampusVoice repository's root `render.yaml` as two Render services:

- `mini-soldier-arena-server`: Colyseus multiplayer server with a `/health` endpoint.
- `mini-soldier-arena-client`: Vite static site; its `VITE_SERVER_URL` is set in the Blueprint to the public secure WebSocket URL of the server.

In Render, open the CampusVoice Blueprint and sync/deploy the latest repository changes. After the client static site is live, copy its HTTPS URL and set `MINI_SOLDIER_ARENA_URL` to that URL in the CampusVoice web app's hosting environment (for example, Vercel if that is where the main app is deployed). Redeploy the CampusVoice web app after setting it.

The first Render Blueprint sync may prompt for the existing Campus Doodle service's secret environment variables. Keep their current values; the Arena services do not need additional secrets.

## Run on your computer (two terminals)

    cd services/mini-soldier-arena/server
    npm install
    npm run dev

    cd services/mini-soldier-arena/client
    npm install
    npm run dev

Open the Vite URL printed in the client terminal (use a second window, or an incognito window, for a second player).

## How the game works

- Open the game: loading screen, then the lobby. **PLAY** matches you with other players in a public 5v5 team match.
  Matchmaking starts when 10 players join or after an 8-second queue window once at least 2 players are waiting.
- Quick Play is an elimination series of 7 rounds. Wipe out the other team to win a round; each new round uses a different random map.
  After the seventh round, leave the match and press **PLAY** to find a new group.
- **Multiplayer** creates a private room. Share its code and the match starts after the selected number of players have joined.
  You can also join an existing private room with its code.
- **Room chat** is available in the waiting lobby and during matches by opening the **Chat** control. It starts collapsed; messages are room-only and limited to 240 characters.
- **Team voice chat** is available in team matches from the **Mic** control beside the game screen. Allow microphone access when prompted;
  voice is sent only to teammates using encrypted WebRTC peer connections. The mic stays unavailable when you have no teammates
  (for example, in a two-player match with one player on each team). Voice requires HTTPS (or localhost) and a browser with
  WebRTC support. It uses STUN for peer discovery but has no TURN relay configured, so some restrictive networks may prevent voice
  connections. The room signaling server, STUN service, and other voice participants can see network connection metadata such as IP addresses.
- **Rounds, no timer.** Private rooms have 1, 3, 5 or 7 rounds. A round ends when someone (or a team) reaches the kill target (5, 10, 15 or 20).
  In a room with "Random" map, every round is played on a different map. The series winner is the one with most rounds won.
- Public Quick Play uses elimination rounds: players do not respawn until the next round.
- **Modes.** Everyone vs everyone (up to 5 players) or Teams 5 vs 5 (up to 10 players). No friendly fire: bullets pass through
  teammates and grenades and rockets do not hurt them.
- **Weapons.** You start with a pistol (unlimited spare bullets). You can carry 3 guns and choose which one to use.
  Only 5 guns, 5 bombs and 5 turbo rockets lie on the map at a time. A taken item comes back after 3 minutes at a different spot.
  A dead player's guns drop on the ground for 1 minute.
- Going outside the arena triggers a warning and drains health gradually until you return. Spawn protection lasts 2 seconds.

## Controls

| | Desktop | Phone (landscape) |
|---|---|---|
| Move / fly | A D, W or Space | left joystick (push up to fly) or JET button |
| Aim and fire | mouse, hold the left button, or F | drag the right aim joystick; holding it also fires |
| Choose gun | 1 2 3, Q, mouse wheel | tap the weapon boxes at the bottom |
| Pick up / swap (bag full) | E | round E button |
| Bomb / reload | G / R | round buttons |
| Sound | M or the Sound button | Sound button |
| Chat / voice | Chat and Mic controls beside the game | Chat button in the lobby; Mic is available in team matches |

Open **Settings** during a match to change touch control size and opacity, rebind keyboard actions, or arrange touch controls by dragging them. The move and aim joysticks, JET, bomb, reload, pickup, and weapon slots can be repositioned. Drag the right aim joystick to aim in any direction; keeping it pushed also fires. Settings are saved in the current browser on the current device; use **Reset defaults** to restore them.

On touch devices, the game requests fullscreen and landscape orientation when supported. If the browser or device does not allow orientation locking, the game stays covered by a rotate-your-phone prompt while in portrait; the page itself does not scroll.

Guns lying on the ground are picked up by walking over them while you have a free slot. When your bag is full, stand on the gun and
press E (or tap the E button) to swap.

## Folders

- `server/src/ArenaRoom.ts` rules, combat, rounds, teams, items. `server/src/shared/` and `client/src/shared/` must stay identical.
- `client/src/scenes/GameScene.ts` the game screen. `client/src/world.ts` draws the maps. `client/src/audio.ts` sound effects.
- `client/src/shared/maps.ts` the seven maps (Jungle Cliffs, Jungle Outpost, Desert Fort, Frost Base, Canyon, City Ruins, Woodland).
- `client/public/assets/` pictures (soldier sheet, weapons, loading screen, icons).

Checks you can run: `npm run typecheck` in `client` or `server`.
