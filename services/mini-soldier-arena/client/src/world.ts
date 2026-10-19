import Phaser from 'phaser';
import { GAME_W, GAME_H } from './config';
import { MapDef, Building, Tunnel, Bridge, ThemeKey, islandRects, buildingRects, WALL } from './shared/maps';

interface Theme {
  skyTop: number; skyBottom: number;
  far: number; farKind: 'mountain' | 'mesa' | 'ruins' | 'forest' | 'dune';
  near: number; nearKind: 'mountain' | 'mesa' | 'ruins' | 'forest' | 'dune';
  top: number; accent: number; rock: number; rockDark: number;
  wall: number; wallDark: number; roof: number; interior: number; plank: number;
  deco: string[];
}

const THEMES: Record<ThemeKey, Theme> = {
  jungle:   { skyTop: 0x8ec9e8, skyBottom: 0xd2ead8, far: 0x7fb59a, farKind: 'mountain', near: 0x4f9a6c, nearKind: 'forest', top: 0x4caf50, accent: 0x8bd45a, rock: 0x6b4f3a, rockDark: 0x4b3626, wall: 0x7a8288, wallDark: 0x5b6268, roof: 0x4d555b, interior: 0x1f2c26, plank: 0x2b3a32, deco: ['palm', 'palm', 'pineG'] },
  desert:   { skyTop: 0x8fbfe8, skyBottom: 0xf4dcae, far: 0xdca86e, farKind: 'mesa', near: 0xc98d52, nearKind: 'dune', top: 0xe6c27a, accent: 0xf6dfa4, rock: 0x9c6b3f, rockDark: 0x7a502e, wall: 0xb89262, wallDark: 0x8f6f44, roof: 0x7d5f3b, interior: 0x34271b, plank: 0x45342a, deco: ['cactus', 'cactus', 'palm'] },
  frost:    { skyTop: 0x9db8d8, skyBottom: 0xdfebf7, far: 0x93aac8, farKind: 'mountain', near: 0x6f88aa, nearKind: 'forest', top: 0xf2f6fb, accent: 0xffffff, rock: 0x5d6f8a, rockDark: 0x43526b, wall: 0x72829b, wallDark: 0x56647c, roof: 0x4a566c, interior: 0x1b2433, plank: 0x27324a, deco: ['pine', 'pine'] },
  canyon:   { skyTop: 0x8fb9e0, skyBottom: 0xf2bda4, far: 0xd98d6c, farKind: 'mesa', near: 0xb8694c, nearKind: 'mesa', top: 0xc9824f, accent: 0xe3a672, rock: 0x8a4a3a, rockDark: 0x663526, wall: 0x84705c, wallDark: 0x65543f, roof: 0x5b4d40, interior: 0x2a1f1a, plank: 0x3a2b24, deco: ['cactus', 'cactus'] },
  city:     { skyTop: 0x7e9dbf, skyBottom: 0xbcc9d9, far: 0x74869f, farKind: 'ruins', near: 0x566883, nearKind: 'ruins', top: 0x6f8a52, accent: 0x8aa860, rock: 0x5a6270, rockDark: 0x434a56, wall: 0x6d7683, wallDark: 0x505863, roof: 0x474e59, interior: 0x1b2129, plank: 0x28303b, deco: ['ruin', 'ruin', 'pineG'] },
  woodland: { skyTop: 0x9ccfe6, skyBottom: 0xd8eed6, far: 0x4f8d66, farKind: 'forest', near: 0x2f6d48, nearKind: 'forest', top: 0x5aa83a, accent: 0x8fd05a, rock: 0x6b5038, rockDark: 0x4a3826, wall: 0x7e654a, wallDark: 0x5c4733, roof: 0x57432f, interior: 0x251c13, plank: 0x35291c, deco: ['pineG', 'pineG', 'pineG'] },
};

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { x: number; y: number };

// Draws one repeating strip of far away scenery (period 1440 px, so it tiles without a seam).
function makeBackdrop(scene: Phaser.Scene, key: string, color: number, kind: Theme['farKind'], seed: number, lift: number) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const r = rng(seed);
  const W = 1440, H = 320;
  g.fillStyle(color);
  if (kind === 'mountain') {
    const peaks = [40, 90, 20];
    for (let i = -1; i < 6; i++) {
      const x = i * 240, top = peaks[((i % 3) + 3) % 3] + lift;
      g.fillStyle(color).fillTriangle(x, H, x + 160, top, x + 400, H);
      g.fillStyle(0xffffff, 0.55).fillTriangle(x + 160, top, x + 122, top + 52, x + 200, top + 52);
    }
  } else if (kind === 'mesa') {
    const tops = [90, 140, 70];
    for (let i = -1; i < 6; i++) {
      const x = i * 240, top = tops[((i % 3) + 3) % 3] + lift, w = 150 + ((i + 1) % 3) * 30;
      g.fillStyle(color).fillPoints([{ x: x, y: H }, { x: x + 28, y: top }, { x: x + 28 + w, y: top }, { x: x + 56 + w, y: H }] as P[], true);
      g.fillStyle(0x000000, 0.12).fillRect(x + 28, top + 30, w, 6);
    }
  } else if (kind === 'ruins') {
    for (let i = 0; i < 18; i++) {
      const x = i * 80, w = 46 + Math.floor(r() * 26), top = 70 + lift + Math.floor(r() * 150);
      g.fillStyle(color).fillRect(x, top, w, H - top);
      g.fillStyle(0x000000, 0.18);
      for (let wy = top + 14; wy < H - 20; wy += 26) for (let wx = x + 8; wx < x + w - 10; wx += 18) if (r() > 0.35) g.fillRect(wx, wy, 8, 12);
      g.fillStyle(color).fillTriangle(x + w * 0.6, top, x + w, top, x + w, top - 16 - r() * 18);
    }
  } else if (kind === 'forest') {
    for (let x = 0; x < W; x += 30) {
      const h = 80 + lift * 0.4 + r() * 80;
      g.fillStyle(color).fillTriangle(x, H, x + 15, H - h, x + 30, H);
      g.fillStyle(color).fillTriangle(x + 4, H - h * 0.4, x + 15, H - h * 1.12, x + 26, H - h * 0.4);
    }
  } else {
    const pts: P[] = [{ x: 0, y: H }];
    for (let x = 0; x <= W; x += 20) pts.push({ x, y: H - 100 - lift * 0.3 + Math.sin((x / W) * Math.PI * 4) * 30 + Math.sin((x / W) * Math.PI * 10) * 10 });
    pts.push({ x: W, y: H });
    g.fillStyle(color).fillPoints(pts, true);
  }
  g.generateTexture(key, W, H);
  g.destroy();
}

function rockPatches(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, th: Theme, r: () => number, density = 1) {
  g.fillStyle(th.rockDark, 0.55);
  const n = Math.min(60, Math.floor((w * h) / 2200 * density));
  for (let i = 0; i < n; i++) g.fillRect(x + r() * (w - 16), y + r() * (h - 8), 8 + r() * 22, 4 + r() * 8);
  g.fillStyle(th.rockDark).fillRect(x, y + h - 3, w, 3);
}

function surface(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, th: Theme, r: () => number) {
  g.fillStyle(th.top).fillRect(x, y, w, 12);
  g.fillStyle(th.accent).fillRect(x, y - 2, w, 5);
  g.fillStyle(th.top);
  for (let px = x + 6; px < x + w - 8; px += 16 + Math.floor(r() * 12)) g.fillRect(px, y + 12, 6 + r() * 3, 5 + r() * 8);
}

function drawBuilding(scene: Phaser.Scene, b: Building, th: Theme, r: () => number) {
  const g = scene.add.graphics().setDepth(1);
  const top = b.floor - b.h;
  // inside (cut-away so you can see what is in there)
  g.fillStyle(th.interior).fillRect(b.x + WALL, top, b.w - 2 * WALL, b.h);
  g.fillStyle(th.plank);
  for (let y = top + 14; y < b.floor; y += 22) g.fillRect(b.x + WALL, y, b.w - 2 * WALL, 3);
  g.fillStyle(0xffffff, 0.05).fillRect(b.x + WALL, top, b.w - 2 * WALL, 18);
  // a shelf and a lamp for the "lived in" look
  g.fillStyle(th.wallDark).fillRect(b.x + b.w * 0.42, top + b.h * 0.38, b.w * 0.16, 7);
  g.fillStyle(0xffd27a, 0.9).fillCircle(b.x + b.w / 2, top + 18, 5);
  g.fillStyle(0xffd27a, 0.12).fillCircle(b.x + b.w / 2, top + 18, 60);
  // crates and barrels inside
  const bx = [b.x + WALL + 34, b.x + b.w - WALL - 34];
  bx.forEach((x, i) => { if (b.w > 260 && (b.kind !== 'temple' || i === 0)) scene.add.image(x, b.floor - 24, i ? 'stone' : 'crate').setDepth(2); });
  if (b.kind === 'temple') {
    g.fillStyle(th.wallDark, 0.6);
    for (let i = 1; i < 4; i++) g.fillRect(b.x + WALL + ((b.w - 2 * WALL) * i) / 4 - 5, top + 12, 10, b.h - 12);
  }
  // walls and roof use exactly the shapes the game collides with
  const [roof, left, right] = buildingRects(b);
  for (const w of [left, right]) {
    g.fillStyle(th.wall).fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle(th.wallDark);
    for (let y = w.y + 10; y < w.y + w.h; y += 18) g.fillRect(w.x, y, w.w, 2);
    g.fillStyle(0xffffff, 0.12).fillRect(w.x, w.y, 3, w.h);
  }
  g.fillStyle(th.roof).fillRect(roof.x - 6, roof.y, roof.w + 12, roof.h);
  g.fillStyle(0xffffff, 0.16).fillRect(roof.x - 6, roof.y, roof.w + 12, 4);
  g.fillStyle(th.wallDark);
  for (let x = roof.x; x < roof.x + roof.w - 10; x += 28) g.fillRect(x, roof.y - 8, 14, 8);   // battlements
  if (b.kind === 'temple') g.fillStyle(th.roof).fillRect(b.x + b.w * 0.3, roof.y - 26, b.w * 0.4, 18);
  // door frame
  const gap = Math.min(104, b.h - 24);
  g.fillStyle(th.wallDark);
  const dx = (side: 'left' | 'right') => (side === 'left' ? b.x : b.x + b.w - WALL);
  if (b.door === 'left' || b.door === 'both') g.fillRect(dx('left'), b.floor - gap - 5, WALL, 5);
  if (b.door === 'right' || b.door === 'both') g.fillRect(dx('right'), b.floor - gap - 5, WALL, 5);
  // flag on forts
  if (b.flag) {
    const fx = b.x + b.w / 2, fy = roof.y - 8;
    const col = b.flag === 'blue' ? 0x2f6bff : b.flag === 'red' ? 0xe53935 : 0x2e7d32;
    g.fillStyle(0x4a4a4a).fillRect(fx - 2, fy - 64, 4, 64);
    g.fillStyle(col).fillTriangle(fx + 2, fy - 64, fx + 2, fy - 38, fx + 44, fy - 51);
  }
  void r;
}

// A cave cut into a cliff: dark inside, a stone frame where it opens, and a few crates.
function drawTunnel(scene: Phaser.Scene, t: Tunnel, th: Theme) {
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(th.interior).fillRect(t.x, t.y, t.w, t.h);
  g.fillStyle(th.plank);
  for (let y = t.y + 16; y < t.y + t.h; y += 24) g.fillRect(t.x, y, t.w, 3);
  g.fillStyle(0x000000, 0.35).fillRect(t.x, t.y, t.w, 22);                     // darker near the ceiling
  g.fillStyle(0xffd27a, 0.1).fillCircle(t.x + t.w / 2, t.y + 30, 70);
  g.fillStyle(0xffd27a, 0.9).fillCircle(t.x + t.w / 2, t.y + 22, 5);           // a lamp
  const frame = (x: number) => {                                              // stone arch at an opening
    g.fillStyle(th.wall).fillRect(x - 10, t.y - 14, 20, t.h + 14);
    g.fillStyle(th.wallDark).fillRect(x - 10, t.y - 14, 20, 6);
    g.fillStyle(th.wall).fillRect(x - 60 + (x < t.x + t.w / 2 ? 60 : 0), t.y - 14, 60, 14);
  };
  if (t.open === 'left' || t.open === 'both') frame(t.x);
  if (t.open === 'right' || t.open === 'both') frame(t.x + t.w);
  if (t.w > 300) {
    scene.add.image(t.x + t.w * 0.2, t.y + t.h - 24, 'crate').setDepth(2);
    scene.add.image(t.x + t.w * 0.82, t.y + t.h - 24, 'stone').setDepth(2);
  }
}

// A rope bridge: planks you can walk on and sagging ropes.
function drawBridge(scene: Phaser.Scene, b: Bridge) {
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x8a6a3c).fillRect(b.x, b.y, b.w, 12);
  g.fillStyle(0x5b4630);
  for (let x = b.x + 6; x < b.x + b.w - 4; x += 16) g.fillRect(x, b.y, 3, 12);
  g.fillStyle(0x4a3a28).fillRect(b.x - 4, b.y - 40, 6, 52).fillRect(b.x + b.w - 2, b.y - 40, 6, 52);
  g.lineStyle(3, 0x5b4630);
  const steps = Math.max(6, Math.round(b.w / 40));
  for (let side = 0; side < 2; side++) {
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = b.x + (b.w * i) / steps, sag = Math.sin((i / steps) * Math.PI) * 14;
      const y = b.y - 38 + sag + side * 0;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
    break;
  }
  g.lineStyle(2, 0x5b4630);
  for (let x = b.x + 30; x < b.x + b.w - 20; x += 44) {
    const i = (x - b.x) / b.w, sag = Math.sin(i * Math.PI) * 14;
    g.lineBetween(x, b.y - 38 + sag, x, b.y);
  }
}

export interface World { far: Phaser.GameObjects.TileSprite; near: Phaser.GameObjects.TileSprite; map: MapDef }

export function buildWorld(scene: Phaser.Scene, map: MapDef): World {
  const th = THEMES[map.theme];
  const r = rng(map.theme.length * 977 + map.W);

  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-30);
  sky.fillGradientStyle(th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1).fillRect(0, 0, GAME_W, GAME_H);
  makeBackdrop(scene, `bgFar_${map.theme}`, th.far, th.farKind, 11, 0);
  makeBackdrop(scene, `bgNear_${map.theme}`, th.near, th.nearKind, 29, 60);
  const far = scene.add.tileSprite(0, 0, GAME_W, 320, `bgFar_${map.theme}`).setOrigin(0, 1).setScrollFactor(0).setDepth(-20);
  const near = scene.add.tileSprite(0, 0, GAME_W, 320, `bgNear_${map.theme}`).setOrigin(0, 1).setScrollFactor(0).setDepth(-19);

  // out of bounds area
  const o = scene.add.graphics().setDepth(5);
  o.fillStyle(0xff0000, 0.16);
  o.fillRect(-1500, map.killTop - 1500, 1500, map.killBottom - map.killTop + 3000);
  o.fillRect(map.W, map.killTop - 1500, 1500, map.killBottom - map.killTop + 3000);
  o.fillRect(0, map.killTop - 1500, map.W, 1500);
  o.fillRect(0, map.killBottom, map.W, 1500);
  o.lineStyle(5, 0xff3b3b, 0.7).strokeRect(0, map.killTop, map.W, map.killBottom - map.killTop);

  const rock = scene.add.graphics().setDepth(1);
  // ground and cliffs
  for (const g of map.ground) {
    const h = map.H + 300 - g.y;
    rock.fillStyle(th.rock).fillRect(g.x, g.y, g.w, h);
    rockPatches(rock, g.x, g.y + 14, g.w, Math.min(h, 360), th, r, 1.2);
    surface(rock, g.x, g.y, g.w, th, r);
  }
  map.cliffs.forEach((c) => {
    rock.fillStyle(th.rock).fillRect(c.x, c.y, c.w, c.h);
    rockPatches(rock, c.x, c.y + 14, c.w, Math.min(c.h, 500), th, r, 1.4);
  });
  map.ledges.forEach((l) => surface(rock, l.x, l.y, l.w, th, r));
  map.tunnels.forEach((t) => drawTunnel(scene, t, th));
  map.bridges.forEach((b) => drawBridge(scene, b));
  // floating islands
  for (const isl of map.islands) {
    const rects = islandRects(isl.x, isl.y, isl.w, isl.d);
    for (const s of rects) {
      rock.fillStyle(th.rock).fillRect(s.x, s.y, s.w, s.h);
      rockPatches(rock, s.x, s.y + 4, s.w, s.h - 4, th, r, 1.6);
    }
    const last = rects[2];
    rock.fillStyle(th.rockDark).fillTriangle(last.x, last.y + last.h, last.x + last.w, last.y + last.h, last.x + last.w / 2, last.y + last.h + 46);
    surface(rock, isl.x, isl.y, isl.w, th, r);
  }

  // buildings (with their insides), then crates
  map.buildings.forEach((b) => drawBuilding(scene, b, th, r));
  map.crates.forEach((c, i) => scene.add.image(c.x + 24, c.y + 24, i % 2 ? 'stone' : 'crate').setDepth(2));

  // trees and other scenery on islands, ground and near the pickups
  const inBuilding = (x: number, y: number) => map.buildings.some((b) => x > b.x - 40 && x < b.x + b.w + 40 && Math.abs(y - b.floor) < 6);
  const nearCrate = (x: number) => map.crates.some((c) => Math.abs(c.x + 24 - x) < 70);
  const decor = (x: number, y: number) => {
    if (inBuilding(x, y) || nearCrate(x)) return;
    scene.add.image(x, y + 2, th.deco[Math.floor(r() * th.deco.length)]).setOrigin(0.5, 1).setDepth(0).setScale(0.8 + r() * 0.5);
  };
  map.islands.forEach((i) => { if (i.w > 260) decor(i.x + i.w * 0.2, i.y); if (i.w > 420) decor(i.x + i.w * 0.82, i.y); });
  map.ground.forEach((g) => { for (let x = g.x + 200; x < g.x + g.w - 150; x += 360 + r() * 160) decor(x, g.y); });
  map.pickupSpots.forEach(([x, top], i) => { if (i % 3 === 0) decor(x + 64, top); });

  return { far, near, map };
}

// Far scenery moves slower than the camera so it looks distant.
export function updateBackdrop(w: World, cam: Phaser.Cameras.Scene2D.Camera) {
  const base = w.map.ground.reduce((a, g) => Math.max(a, g.y), 0);
  w.far.tilePositionX = cam.scrollX * 0.2; w.far.y = base * 0.9 - cam.scrollY * 0.55;
  w.near.tilePositionX = cam.scrollX * 0.4; w.near.y = base * 0.98 - cam.scrollY * 0.8;
}
