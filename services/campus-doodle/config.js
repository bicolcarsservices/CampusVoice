'use strict';
// All values that affect gameplay, rewards or prices live here (server-side only).
// The browser never supplies or overrides any of them.
const FAST = process.env.TEST_FAST === '1'; // used only by the automated tests

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  RULES_VERSION: 1,

  // Match-placement rewards (Coins). Rank 5+ gets nothing.
  REWARDS: { 1: 100, 2: 70, 3: 50, 4: 25 },

  MAX_PLAYERS: 8,
  MIN_PLAYERS_TO_START: 2,
  MIN_PLAYERS_FOR_REWARD: 3,        // matches with fewer eligible players are "friendly" (no Coins)
  REWARD_MIN_TURN_SHARE: 0.5,       // player must have been present for >= 50% of turns
  REWARD_LIMIT_PER_HOUR: 6,         // rewarded matches per player per rolling hour
  REPEAT_GROUP_LIMIT: 4,            // same exact group, valid matches in 24h before review hold

  ROUNDS: { min: 1, max: 6, def: 3 },
  DRAW_TIME: { min: FAST ? 3 : 30, max: 120, def: 80 },
  WORD_CHOICES: 3,

  CHOOSE_TIME: FAST ? 2 : 15,
  STARTING_TIME: FAST ? 1 : 3,
  RESULTS_TIME: FAST ? 1 : 6,
  NEXT_TIME: FAST ? 1 : 2,

  RECONNECT_GRACE_MS: FAST ? 4000 : 60000,
  ARTIST_GRACE_MS: FAST ? 1500 : 10000,
  HOST_GRACE_MS: FAST ? 1500 : 30000,
  ABANDON_MS: FAST ? 3000 : 30000,
  ROOM_IDLE_MS: 120000,
  ROOM_TTL_MS: 3 * 3600 * 1000,

  ROOM_CREATE_LIMIT: { count: 5, windowMs: 10 * 60 * 1000 },
  PUBLIC_START_DELAY_MS: 1500,

  // Shop catalog (authoritative). All cosmetic, none affect gameplay.
  ITEMS: [
    { id: 'frame_bronze', name: 'Bronze frame', type: 'frame', price: 120, maxOwned: 1, desc: 'A warm bronze ring around your avatar.', style: { color: '#B9722E' }, active: true },
    { id: 'frame_neon', name: 'Neon frame', type: 'frame', price: 250, maxOwned: 1, desc: 'A glowing teal ring.', style: { color: '#12D6B5' }, active: true },
    { id: 'frame_royal', name: 'Royal frame', type: 'frame', price: 400, maxOwned: 1, desc: 'Deep violet, for champions.', style: { color: '#7B2FF7' }, active: true },
    { id: 'badge_star', name: 'Star badge', type: 'badge', price: 60, maxOwned: 1, desc: 'A small star next to your name.', style: { emoji: '⭐' }, active: true },
    { id: 'badge_brush', name: 'Brush badge', type: 'badge', price: 90, maxOwned: 1, desc: 'For people who love to draw.', style: { emoji: '🖌️' }, active: true },
    { id: 'badge_crown', name: 'Crown badge', type: 'badge', price: 200, maxOwned: 1, desc: 'Wear your wins.', style: { emoji: '👑' }, active: true },
    { id: 'title_doodler', name: 'Title: Doodler', type: 'title', price: 150, maxOwned: 1, desc: 'Shown under your name.', style: { text: 'Doodler' }, active: true },
    { id: 'title_master', name: 'Title: Doodle Master', type: 'title', price: 300, maxOwned: 1, desc: 'Shown under your name.', style: { text: 'Doodle Master' }, active: true },
    { id: 'theme_paper', name: 'Paper canvas', type: 'theme', price: 100, maxOwned: 1, desc: 'Warm off-white canvas (only you see your theme).', style: { bg: '#FFFBEF' }, active: true },
    { id: 'theme_chalk', name: 'Chalkboard canvas', type: 'theme', price: 180, maxOwned: 1, desc: 'Dark green canvas (only you see your theme).', style: { bg: '#2F4A3A' }, active: true },
    { id: 'theme_blueprint', name: 'Blueprint canvas', type: 'theme', price: 180, maxOwned: 1, desc: 'Deep blue canvas (only you see your theme).', style: { bg: '#1D4E89' }, active: true }
  ]
};
