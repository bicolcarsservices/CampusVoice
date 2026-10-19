// IMPORTANT: this file must stay IDENTICAL in client/src/shared/weapons.ts and server/src/shared/weapons.ts.

export type WeaponKey = 'pistol' | 'tt33' | 'browning' | 'revolver' | 'uzi' | 'tommy' | 'm16' | 'ak47' | 'ar' | 'svd' | 'kar98' | 'rpg' | 'knife';
export type BombKind = 'grenade' | 'pineapple';
export type PickupType = WeaponKey | BombKind | 'turbo' | 'medkit';
export type WeaponClass = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'heavy' | 'melee';

export interface WeaponDef {
  name: string;
  cls: WeaponClass;
  kind: 'gun' | 'rocket' | 'melee';
  dmg: number;       // damage per bullet (rocket: damage at the centre of the blast)
  rate: number;      // ms between shots
  mag: number;       // bullets per magazine
  reserve: number;   // spare bullets
  speed: number;     // bullet speed px/s
  life: number;      // bullet lifetime s
  spread: number;    // random aim error in radians
  reload: number;    // ms
  len: number;       // length of the gun picture in the game (px)
  range?: number;    // melee reach
  infinite?: boolean; // unlimited spare bullets (only the pistol)
  radius?: number;   // rocket blast radius
}

export const START_WEAPON: WeaponKey = 'pistol';

export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  pistol:   { name: 'PISTOL',    cls: 'pistol', kind: 'gun',    infinite: true, dmg: 14, rate: 280,  mag: 12, reserve: 0,  speed: 1000, life: 0.8, spread: 0.02,  reload: 900,  len: 30 },
  tt33:     { name: 'TT-33',     cls: 'pistol', kind: 'gun',    dmg: 22, rate: 380,  mag: 8,  reserve: 24,  speed: 1100, life: 0.85, spread: 0.02, reload: 1000, len: 28 },
  browning: { name: 'BROWNING',  cls: 'pistol', kind: 'gun',    dmg: 17, rate: 210,  mag: 13, reserve: 39,  speed: 1000, life: 0.8, spread: 0.03,  reload: 900,  len: 30 },
  revolver: { name: 'REVOLVER',  cls: 'pistol', kind: 'gun',    dmg: 42, rate: 650,  mag: 6,  reserve: 18,  speed: 1250, life: 0.9, spread: 0.015, reload: 1300, len: 34 },
  uzi:      { name: 'UZI',       cls: 'smg',    kind: 'gun',    dmg: 8,  rate: 60,   mag: 32, reserve: 96,  speed: 950,  life: 0.65, spread: 0.10, reload: 1100, len: 34 },
  tommy:    { name: 'TOMMY GUN', cls: 'smg',    kind: 'gun',    dmg: 11, rate: 85,   mag: 50, reserve: 100, speed: 950,  life: 0.75, spread: 0.09, reload: 1500, len: 52 },
  m16:      { name: 'M16',       cls: 'rifle',  kind: 'gun',    dmg: 16, rate: 100,  mag: 30, reserve: 90,  speed: 1000, life: 0.9, spread: 0.04,  reload: 1300, len: 54 },
  ak47:     { name: 'AK-47',     cls: 'rifle',  kind: 'gun',    dmg: 21, rate: 125,  mag: 30, reserve: 90,  speed: 1000, life: 0.9, spread: 0.06,  reload: 1400, len: 52 },
  ar:       { name: 'ASSAULT RIFLE', cls: 'rifle', kind: 'gun', dmg: 17, rate: 95,   mag: 35, reserve: 105, speed: 1000, life: 0.9, spread: 0.05,  reload: 1400, len: 52 },
  svd:      { name: 'SNIPER',    cls: 'sniper', kind: 'gun',    dmg: 58, rate: 720,  mag: 8,  reserve: 24,  speed: 1700, life: 1.5, spread: 0.005, reload: 1800, len: 58 },
  kar98:    { name: 'BOLT RIFLE', cls: 'sniper', kind: 'gun',   dmg: 88, rate: 1250, mag: 5,  reserve: 15,  speed: 1900, life: 1.6, spread: 0.003, reload: 2200, len: 62 },
  rpg:      { name: 'ROCKET LAUNCHER', cls: 'heavy', kind: 'rocket', dmg: 90, rate: 1500, mag: 1, reserve: 3, speed: 650, life: 2.2, spread: 0, reload: 2000, len: 64, radius: 120 },
  knife:    { name: 'KNIFE',     cls: 'melee',  kind: 'melee',  dmg: 38, rate: 420,  mag: 0,  reserve: 0,   speed: 0,    life: 0,   spread: 0,     reload: 0,    len: 34, range: 62 },
};

export const BOMBS: Record<BombKind, { name: string; fuse: number; radius: number; dmg: number }> = {
  grenade:   { name: 'GRENADE',   fuse: 1.5, radius: 130, dmg: 85 },
  pineapple: { name: 'PINEAPPLE', fuse: 1.8, radius: 150, dmg: 95 },
};

export const isWeapon = (t: string): t is WeaponKey => t in WEAPONS;

// ---- what lies on the map ----
export type PickupCat = 'gun' | 'bomb' | 'turbo' | 'medkit';
export const catOf = (t: PickupType): PickupCat => (isWeapon(t) ? 'gun' : t === 'turbo' || t === 'medkit' ? t : 'bomb');

export const MAX_SLOTS = 3;                                      // weapons you can carry (the pistol is slot 1)
export const PICKUP_COUNTS: Record<PickupCat, number> = { gun: 5, bomb: 5, turbo: 5, medkit: 5 };   // how many lie on the map at once
export const PICKUP_RESPAWN_MS = 3 * 60 * 1000;                  // a taken item comes back after 3 minutes, somewhere else
export const DROP_LIFETIME_MS = 60 * 1000;                       // a gun dropped by a dead player stays this long

// Random guns that can appear on the map. Higher weight = more common. The pistol is never on the map.
export const GUN_WEIGHTS: [WeaponKey, number][] = [
  ['tt33', 2], ['browning', 2], ['revolver', 2], ['uzi', 3], ['tommy', 3], ['m16', 3],
  ['ak47', 3], ['ar', 3], ['svd', 2], ['kar98', 1], ['rpg', 1], ['knife', 1],
];
