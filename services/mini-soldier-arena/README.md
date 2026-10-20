# Mini Soldier Arena

Online 2D jetpack shooter. Phaser 3 + TypeScript + Vite (game) and Node.js + Colyseus (multiplayer server).

    server/   multiplayer server (port 2567)      client/   the game (port 5173)

## CampusVoice integration and deployment

Mini Soldier Arena is the fourth game in the CampusVoice games catalog and is hosted separately from the Next.js app. The root `render.yaml` defines:

- `mini-soldier-arena-server`: Colyseus multiplayer server with a `/health` endpoint.
- `mini-soldier-arena-client`: Vite static site configured to connect securely to the server.

Sync and deploy the CampusVoice Blueprint in Render. Confirm the server responds at `/health`, then set `MINI_SOLDIER_ARENA_URL` in the CampusVoice web app's hosting environment to the deployed client URL (normally `https://mini-soldier-arena-client.onrender.com`) and redeploy the web app. The game page also defaults to that Render URL in production; use the environment variable if the service has a different URL.

The first Blueprint sync may prompt for the existing Campus Doodle service's secrets. Keep their current values; Mini Soldier Arena does not require additional secrets.

## Run locally

From the CampusVoice root, start the server and client in separate terminals:

    npm run game:mini-soldier-arena:server
    npm run game:mini-soldier-arena:client

Then open `/games/mini-soldier-arena` in the local CampusVoice app. On a touch device, the game requests fullscreen and landscape on the first tap; if the browser cannot lock orientation, turn the phone sideways before the match starts. For deployment details, read **DEPLOY.md**.

## How the game works

- Open the game to the lobby. **PLAY** joins a public match; **Settings** lets you arrange the touch controls before a match.
- **Multiplayer** creates a private waiting lobby. Share the room code or invite link, wait for another player, then the host presses **Start Game**.
  Joining by room code or invite link opens that lobby. Players who join after the host starts enter the active match.
- **Rounds, no timer.** Choose 1 to 7 rounds for a series (the public room creator or private-room host sets the match). A round ends when someone (or a team) reaches the kill target (5, 10, 15 or 20).
  In a room with "Random" map, every round is played on a different map. After the selected final round, the result is shown and players return to the lobby instead of starting another series.
- **Modes.** Everyone vs everyone (up to 5 players) or Teams 5 vs 5 (up to 10 players). No friendly fire: bullets pass through
  teammates and grenades and rockets do not hurt them.
- **Weapons and supplies.** You start with a pistol (unlimited spare bullets). You can carry 3 guns and choose which one to use.
  Up to 5 guns, 5 bombs, 5 turbo rockets, 5 ammo boxes and 3 first-aid kits lie on the map at a time.
  World guns and ammo boxes return 3 minutes after collection; first-aid kits return after 2 minutes. Other collected map items return after 3 minutes.
  Each ammo box adds 100 reserve bullets to the equipped ammo-using gun, or the first ammo-using gun in your inventory. It stays on the map if you have no ammo-using gun.
  A first-aid kit restores up to 40 health, to a maximum of 100; it is not consumed when your health is already full.
  A dead player's guns drop on the ground for 1 minute, then disappear.
- Going outside the red border shows a warning. After a 1.5-second grace period, your health drains by 10 per second until you return or are eliminated. Spawn protection lasts 2 seconds.

## Controls

| | Desktop | Phone (landscape) |
|---|---|---|
| Move / fly | A D, W or Space | left joystick (push up to fly; the soldier turns where you steer) |
| Aim and fire | mouse, hold the left button | aim with the right joystick and hold it to fire |
| Choose gun | 1 2 3, Q, mouse wheel | tap the weapon boxes at the bottom |
| Pick up / swap (bag full) | E | round E button |
| Bomb / reload | G / R | round buttons |
| Sound | M or the Sound button | Sound button |

On phones, use **Settings** before or during a match to drag the movement joystick, aim/fire joystick, bomb, reload, pickup, and weapon bar to comfortable positions. Changes are saved on that device; use **Reset Controls** to restore the defaults.

Guns lying on the ground are picked up by walking over them while you have a free slot. When your bag is full, stand on the gun and
press E (or tap the E button) to swap.

In the private waiting lobby, use **Copy Code** or **Invite** before the match starts. The host can change touch settings there and starts the match when everyone is ready.

## Folders

- `server/src/ArenaRoom.ts` rules, combat, rounds, teams, items. `server/src/shared/` and `client/src/shared/` must stay identical.
- `client/src/scenes/GameScene.ts` the game screen. `client/src/world.ts` draws the maps. `client/src/audio.ts` sound effects.
- `client/src/shared/maps.ts` the seven maps (Jungle Cliffs, Jungle Outpost, Desert Fort, Frost Base, Canyon, City Ruins, Woodland).
- `client/public/assets/` pictures (soldier sheet, weapons, loading screen, icons).

Checks you can run: `npm run typecheck` in `client` or `server`.
