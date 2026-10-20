# Deploy Mini Soldier Arena with CampusVoice

Mini Soldier Arena is the fourth game in the CampusVoice games catalog. It consists of a Vite game client and a Colyseus multiplayer server, both defined in the CampusVoice root `render.yaml`.

## Deploy on Render

1. Push the CampusVoice project changes to its connected Git repository.
2. In Render, open the CampusVoice Blueprint and sync the latest `render.yaml`.
3. Deploy `mini-soldier-arena-server` and `mini-soldier-arena-client`.
4. Confirm that `https://mini-soldier-arena-server.onrender.com/health` returns `{"ok":true}`.
5. Set `MINI_SOLDIER_ARENA_URL` in the CampusVoice web app's hosting environment to the client URL, normally `https://mini-soldier-arena-client.onrender.com`, and redeploy CampusVoice.

If Render assigns a different client hostname, use that hostname for `MINI_SOLDIER_ARENA_URL`. The game server URL is passed to the Vite client through the Blueprint's `VITE_SERVER_HOST` service reference.

The initial Blueprint sync may ask for existing Campus Doodle secrets. Keep their configured values. Mini Soldier Arena requires no additional secrets.

## Run locally

From the CampusVoice project root, start the server and client in separate terminals:

    npm run game:mini-soldier-arena:server
    npm run game:mini-soldier-arena:client

With the CampusVoice app running, open `/games/mini-soldier-arena`. On a touch device the game requests fullscreen and landscape on the first tap. Browsers that reject orientation locking display a blocking prompt until the device is rotated to landscape.
