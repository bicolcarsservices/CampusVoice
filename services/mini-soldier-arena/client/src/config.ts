export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';

export const GAME_W = 1280;
export const GAME_H = 720;

// Size of one frame in public/assets/soldier.png and the y pixel where the feet touch the ground
export const CELL_W = 68;
export const CELL_H = 67;
export const FEET = 64;

export const JOY_R = 70;
export const INTERP_DELAY_MS = 110;

// true = after the loading screen the player joins a public match automatically.
// false = show the lobby so players can adjust settings or choose a room first.
export const AUTO_QUICKPLAY = false;
