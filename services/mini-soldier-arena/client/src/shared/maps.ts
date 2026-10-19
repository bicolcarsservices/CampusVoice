// IMPORTANT: this file must stay IDENTICAL in client/src/shared/maps.ts and server/src/shared/maps.ts.
// Six maps. Every map is plain data (rectangles), so the server and all browsers collide with exactly the same shapes.
import { Rect, overlaps } from './sim';

export type ThemeKey = 'jungle' | 'desert' | 'frost' | 'canyon' | 'city' | 'woodland';
export interface Building { kind: 'fort' | 'bunker' | 'temple'; x: number; floor: number; w: number; h: number; door: 'left' | 'right' | 'both'; team?: 'blue' | 'red'; flag?: 'blue' | 'red' | 'green' }
export interface IslandDef { x: number; y: number; w: number; d: number }      // d = how deep the rock hangs under the surface
export interface Tunnel { x: number; y: number; w: number; h: number; open: 'left' | 'right' | 'both' }   // a cave cut into a cliff
export interface Bridge { x: number; y: number; w: number }
export interface Ledge { x: number; y: number; w: number }                    // a walkable grass top of a cliff
export interface GroundSeg { x: number; y: number; w: number }
export interface MapDef {
  id: string; name: string; theme: ThemeKey; W: number; H: number; killTop: number; killBottom: number;
  islands: IslandDef[]; ground: GroundSeg[]; cliffs: Rect[]; ledges: Ledge[]; tunnels: Tunnel[]; bridges: Bridge[]; buildings: Building[]; crates: Rect[];
  solids: Rect[]; spawns: [number, number][]; pickupSpots: [number, number][];
  flags: { blue: [number, number]; red: [number, number] };
}

const SX = 4.3;           // the map pictures are about 512 x 500, the game world is about 2200 x 1400
const SY = 2.8;
export const MAP_W = 2200;
export const MAP_H = 1400;
export const WALL = 18;   // wall and roof thickness of buildings
const DOOR = 104;         // height of a doorway

// A floating island is a slab with two narrower layers below it, like the pictures.
export function islandRects(x: number, y: number, w: number, d = 130): Rect[] {
  const rest = Math.max(40, d - 28);
  return [
    { x, y, w, h: 28 },
    { x: x + w * 0.15, y: y + 28, w: w * 0.7, h: rest * 0.49 },
    { x: x + w * 0.33, y: y + 28 + rest * 0.49, w: w * 0.34, h: rest * 0.51 },
  ];
}

// Cut a rectangular hole out of a rectangle: returns the pieces that are left.
function subtract(r: Rect, h: Rect): Rect[] {
  if (h.x >= r.x + r.w || h.x + h.w <= r.x || h.y >= r.y + r.h || h.y + h.h <= r.y) return [r];
  const out: Rect[] = [];
  const hy0 = Math.max(r.y, h.y), hy1 = Math.min(r.y + r.h, h.y + h.h);
  if (h.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: h.y - r.y });
  if (h.y + h.h < r.y + r.h) out.push({ x: r.x, y: h.y + h.h, w: r.w, h: r.y + r.h - (h.y + h.h) });
  if (h.x > r.x) out.push({ x: r.x, y: hy0, w: h.x - r.x, h: hy1 - hy0 });
  if (h.x + h.w < r.x + r.w) out.push({ x: h.x + h.w, y: hy0, w: r.x + r.w - (h.x + h.w), h: hy1 - hy0 });
  return out;
}

export function buildingRects(b: Building): Rect[] {
  const gap = Math.min(DOOR, b.h - 24);
  const top = b.floor - b.h;
  const left = b.door === 'left' || b.door === 'both' ? { x: b.x, y: top, w: WALL, h: b.h - gap } : { x: b.x, y: top, w: WALL, h: b.h };
  const right = b.door === 'right' || b.door === 'both' ? { x: b.x + b.w - WALL, y: top, w: WALL, h: b.h - gap } : { x: b.x + b.w - WALL, y: top, w: WALL, h: b.h };
  return [{ x: b.x, y: top - WALL, w: b.w, h: WALL }, left, right];
}

type Door = 'left' | 'right' | 'both';
interface Spec {
  id: string; name: string; theme: ThemeKey; seed: number; fortY: number;
  sx?: number; sy?: number; W?: number; H?: number;   // picture pixels -> game pixels (defaults suit the 512 x 500 pictures)
  cliff: [number, number][];                    // [width, down to y] steps of the side cliffs (picture pixels)
  cliffRects?: [number, number, number, number][];   // custom cliff bodies [x, y, w, h]; replaces the simple stepped cliffs
  tunnels?: [number, number, number, number, 'left' | 'right' | 'both'][];   // caves cut into the cliffs [x, y, w, h, open side]
  bridges?: [number, number, number][];         // rope bridges [x from, x to, y]
  islands: [number, number, number, number?][]; // [x, top y, width, depth]
  ground: [number, number, number][];           // [x, top y, width]
  buildings: ['fort' | 'bunker' | 'temple', number, number, number, number, Door, ('blue' | 'red' | 'green')?][];   // kind, x, floor y, width, height, door, flag
  crates: [number, number][];                   // [x, surface y]
}

const SPECS: Spec[] = [
  { id: 'jungle2', name: 'Jungle Cliffs', theme: 'jungle', seed: 4, fortY: 285, sx: 1.65, sy: 1.65, W: 2759, H: 1553, cliff: [],
    cliffRects: [[0, 285, 300, 193], [0, 478, 380, 194], [0, 672, 290, 158], [1390, 288, 282, 197], [1290, 485, 382, 195], [1340, 680, 332, 150],
                 [680, 650, 315, 255], [495, 782, 115, 123], [915, 810, 240, 95]],
    tunnels: [[130, 365, 170, 97, 'right'], [200, 548, 180, 102, 'right'], [1390, 365, 170, 97, 'left'], [1290, 548, 180, 102, 'left'], [680, 795, 315, 110, 'both']],
    islands: [[415, 283, 140, 105], [700, 233, 250, 267], [1100, 288, 155, 105], [520, 460, 190, 130], [940, 445, 195, 135], [335, 645, 145, 135], [1145, 660, 170, 120]],
    ground: [[0, 835, 440], [440, 905, 860], [1300, 850, 372]],
    bridges: [[300, 415, 290], [555, 700, 288], [950, 1100, 288], [1255, 1390, 292], [380, 520, 482], [1135, 1290, 488]],
    buildings: [['fort', 85, 285, 135, 100, 'right'], ['fort', 1485, 290, 135, 100, 'left'], ['temple', 750, 233, 150, 80, 'both', 'green']],
    crates: [[40, 285], [240, 285], [480, 283], [510, 283], [725, 233], [925, 233], [1170, 288], [1455, 290], [1650, 290], [620, 460], [1040, 445],
             [405, 645], [1230, 660], [770, 650], [860, 650], [560, 782], [1040, 810], [330, 478], [1560, 485], [200, 672], [1420, 680], [520, 905], [1100, 905]] },
  { id: 'jungle', name: 'Jungle Outpost', theme: 'jungle', seed: 0, fortY: 175, cliff: [[28, 500]],
    islands: [[0, 175, 155], [357, 175, 155], [195, 265, 155], [75, 285, 115], [385, 285, 85], [178, 388, 152], [30, 322, 80], [400, 322, 80]],
    ground: [[0, 468, 512]],
    buildings: [['fort', 14, 175, 88, 62, 'right'], ['fort', 410, 175, 88, 62, 'left'], ['temple', 213, 265, 120, 100, 'both'], ['bunker', 28, 468, 80, 46, 'right'], ['bunker', 404, 468, 80, 46, 'left']],
    crates: [[215, 388], [280, 388], [100, 285], [420, 285], [150, 468], [340, 468], [55, 322], [425, 322]] },
  { id: 'desert', name: 'Desert Fort', theme: 'desert', seed: 3, fortY: 172, cliff: [[18, 500]],
    islands: [[10, 172, 160], [345, 172, 160], [170, 212, 180], [45, 280, 120], [350, 280, 120], [185, 332, 135]],
    ground: [[0, 470, 512], [0, 420, 215], [297, 420, 215]],
    buildings: [['fort', 20, 172, 88, 62, 'right'], ['fort', 404, 172, 88, 62, 'left'], ['temple', 215, 212, 100, 105, 'both'], ['bunker', 15, 420, 70, 44, 'right'], ['bunker', 427, 420, 70, 44, 'left']],
    crates: [[190, 212], [330, 212], [90, 280], [410, 280], [250, 332], [240, 470], [270, 470]] },
  { id: 'frost', name: 'Frost Base', theme: 'frost', seed: 5, fortY: 172, cliff: [[28, 500]],
    islands: [[0, 172, 150], [362, 172, 150], [195, 270, 120], [88, 240, 65], [359, 240, 65], [35, 290, 105], [372, 290, 105], [115, 372, 95], [302, 372, 95]],
    ground: [[0, 465, 512]],
    buildings: [['fort', 10, 172, 88, 62, 'right'], ['fort', 414, 172, 88, 62, 'left'], ['temple', 208, 270, 95, 95, 'both'], ['bunker', 15, 465, 75, 45, 'right'], ['bunker', 422, 465, 75, 45, 'left']],
    crates: [[140, 372], [330, 372], [70, 290], [430, 290], [200, 465], [310, 465]] },
  { id: 'canyon', name: 'Canyon', theme: 'canyon', seed: 7, fortY: 144, cliff: [[130, 300], [85, 380], [40, 500]],
    islands: [[0, 144, 130], [382, 144, 130], [178, 178, 72], [292, 178, 60], [98, 258, 80], [335, 258, 75], [190, 345, 135]],
    ground: [[0, 440, 175], [337, 440, 175], [225, 455, 62]],
    buildings: [['fort', 20, 144, 88, 58, 'right'], ['fort', 404, 144, 88, 58, 'left'], ['temple', 212, 345, 90, 80, 'both'], ['bunker', 45, 440, 80, 42, 'right'], ['bunker', 387, 440, 80, 42, 'left']],
    crates: [[125, 258], [360, 258], [215, 345], [300, 345], [260, 455]] },
  { id: 'city', name: 'City Ruins', theme: 'city', seed: 2, fortY: 160, cliff: [[28, 500]],
    islands: [[10, 160, 130], [385, 160, 127], [180, 210, 142], [68, 251, 90], [351, 251, 80], [173, 318, 170]],
    ground: [[0, 440, 512]],
    buildings: [['fort', 20, 160, 88, 60, 'right'], ['fort', 410, 160, 88, 60, 'left'], ['bunker', 28, 440, 78, 45, 'right'], ['bunker', 406, 440, 78, 45, 'left']],
    crates: [[240, 210], [270, 210], [95, 251], [380, 251], [230, 318], [300, 318], [200, 440], [245, 440], [310, 440]] },
  { id: 'woodland', name: 'Woodland', theme: 'woodland', seed: 9, fortY: 170, cliff: [[28, 500]],
    islands: [[10, 170, 150], [335, 170, 177], [205, 148, 95], [95, 285, 100], [320, 285, 100], [205, 345, 115]],
    ground: [[0, 440, 512]],
    buildings: [['fort', 20, 170, 90, 62, 'right'], ['fort', 404, 170, 90, 62, 'left'], ['temple', 222, 148, 60, 55, 'both'], ['temple', 222, 345, 70, 60, 'both'], ['bunker', 25, 440, 70, 40, 'right'], ['bunker', 417, 440, 70, 40, 'left']],
    crates: [[120, 285], [360, 285], [150, 440], [250, 440], [300, 440], [360, 440]] },
];

function build(spec: Spec): MapDef {
  const sx = spec.sx ?? SX, sy = spec.sy ?? SY;
  const W = spec.W ?? MAP_W, H = spec.H ?? MAP_H;
  const islands: IslandDef[] = spec.islands.map(([x, y, w, d]) => ({ x: x * sx, y: y * sy, w: w * sx, d: d === undefined ? 130 : d * sy }));
  const ground: GroundSeg[] = spec.ground.map(([x, y, w]) => ({ x: x * sx, y: y * sy, w: w * sx }));
  const buildings: Building[] = spec.buildings.map(([kind, x, fy, w, h, door, flag]) => ({ kind, x: x * sx, floor: fy * sy, w: w * sx, h: h * sy, door, flag }));
  const forts = buildings.filter((b) => b.kind === 'fort');
  if (forts[0]) { forts[0].team = 'blue'; forts[0].flag = 'blue'; }
  if (forts[1]) { forts[1].team = 'red'; forts[1].flag = 'red'; }
  const crates: Rect[] = spec.crates.map(([x, top]) => ({ x: x * sx - 24, y: top * sy - 48, w: 48, h: 48 }));
  const tunnels: Tunnel[] = (spec.tunnels ?? []).map(([x, y, w, h, open]) => ({ x: x * sx, y: y * sy, w: w * sx, h: h * sy, open }));
  const bridges: Bridge[] = (spec.bridges ?? []).map(([x1, x2, y]) => ({ x: x1 * sx, y: y * sy, w: (x2 - x1) * sx }));

  // cliffs: either custom bodies with caves cut out, or the simple stepped side walls
  let cliffs: Rect[] = [];
  const ledges: Ledge[] = [];
  if (spec.cliffRects) {
    for (const [x, y, w, h] of spec.cliffRects) {
      let pieces: Rect[] = [{ x: x * sx, y: y * sy, w: w * sx, h: h * sy }];
      ledges.push({ x: x * sx, y: y * sy, w: w * sx });
      for (const t of tunnels) pieces = pieces.flatMap((p) => subtract(p, { x: t.x, y: t.y, w: t.w, h: t.h }));
      cliffs.push(...pieces);
    }
  } else {
    let y0 = spec.fortY * sy;
    spec.cliff.forEach(([cw, toY], idx) => {
      const h = Math.max(1, (toY >= 500 ? H + 100 : toY * sy) - y0);
      cliffs.push({ x: 0, y: y0, w: cw * sx, h }, { x: W - cw * sx, y: y0, w: cw * sx, h });
      if (idx === 0) ledges.push({ x: 0, y: y0, w: cw * sx }, { x: W - cw * sx, y: y0, w: cw * sx });
      y0 += h;
    });
  }

  const solids: Rect[] = [];
  ground.forEach((g) => solids.push({ x: g.x, y: g.y, w: g.w, h: H + 100 - g.y }));
  solids.push(...cliffs);
  islands.forEach((i) => solids.push(...islandRects(i.x, i.y, i.w, i.d)));
  bridges.forEach((b) => solids.push({ x: b.x, y: b.y, w: b.w, h: 12 }));
  buildings.forEach((b) => solids.push(...buildingRects(b)));
  solids.push(...crates);

  const free = (x: number, top: number) => !solids.some((s) => overlaps({ x, y: top - 0.01 }, s));
  const freeItem = (x: number, top: number) => {
    const box = { x: x - 26, y: top - 44, w: 52, h: 42 };
    return !solids.some((s) => box.x < s.x + s.w && box.x + box.w > s.x && box.y < s.y + s.h && box.y + box.h > s.y);
  };

  // spawn points: spread along every island, ledge and ground piece, kept only if the soldier fits
  const spawns: [number, number][] = [];
  const cand = (x: number, top: number) => { if (free(x, top)) spawns.push([Math.round(x), Math.floor(top)]); };
  islands.forEach((i) => [0.2, 0.5, 0.8].forEach((f) => cand(i.x + i.w * f, i.y)));
  ledges.forEach((l) => [0.15, 0.4, 0.65, 0.9].forEach((f) => cand(l.x + l.w * f, l.y)));
  ground.forEach((g) => [0.15, 0.35, 0.5, 0.65, 0.85].forEach((f) => cand(g.x + g.w * f, g.y)));

  // Spots where items may appear (the server picks a few at random, and a different spot each time):
  // inside every building and cave, on roofs, islands, ledges and along the ground.
  const pickupSpots: [number, number][] = [];
  const addSpot = (x: number, top: number) => {
    if (freeItem(x, top) && !pickupSpots.some(([px, py]) => Math.abs(px - x) < 90 && Math.abs(py - top) < 80)) pickupSpots.push([Math.round(x), Math.floor(top)]);
  };
  buildings.forEach((b) => {
    [0.22, 0.5, 0.78].forEach((f) => addSpot(b.x + WALL + (b.w - 2 * WALL) * f, b.floor));
    [0.3, 0.7].forEach((f) => addSpot(b.x + b.w * f, b.floor - b.h - WALL));
  });
  tunnels.forEach((t) => [0.25, 0.5, 0.75].forEach((f) => addSpot(t.x + t.w * f, t.y + t.h)));
  islands.forEach((i) => [0.18, 0.5, 0.82].forEach((f) => addSpot(i.x + i.w * f, i.y)));
  ledges.forEach((l) => [0.2, 0.5, 0.8].forEach((f) => addSpot(l.x + l.w * f, l.y)));
  ground.forEach((g) => { for (let x = g.x + 120; x < g.x + g.w - 100; x += 300) addSpot(x, g.y); });

  const flagOf = (b?: Building): [number, number] => (b ? [b.x + b.w / 2, b.floor - b.h - WALL] : [0, 0]);
  return {
    id: spec.id, name: spec.name, theme: spec.theme, W, H, killTop: -200, killBottom: H + 60,
    islands, ground, cliffs, ledges, tunnels, bridges, buildings, crates, solids, spawns, pickupSpots,
    flags: { blue: flagOf(forts[0]), red: flagOf(forts[1]) },
  };
}

export const MAPS: Record<string, MapDef> = {};
SPECS.forEach((s) => { MAPS[s.id] = build(s); });
export const MAP_IDS = SPECS.map((s) => s.id);
export const getMap = (id: string): MapDef => MAPS[id] ?? MAPS[MAP_IDS[0]];
