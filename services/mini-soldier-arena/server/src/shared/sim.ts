// IMPORTANT: this file must stay IDENTICAL in client/src/shared/sim.ts and server/src/shared/sim.ts.
// It holds the movement rules, so the server and every browser simulate the same physics.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Body { x: number; y: number; vx: number; vy: number; onGround: boolean } // x = centre, y = FEET
export interface InputCmd { seq: number; dx: number; thrust: boolean; aim: number; fire: boolean; bomb: boolean; reload: boolean; pick: boolean; sel: number }

export const FIXED_DT = 1 / 60;
export const GRAVITY = 900;
export const SPEED = 270;
export const THRUST_ACC = -1750;
export const MAX_UP = 420;
export const MAX_DOWN = 420;
export const SPEED_TURBO = 400;
export const THRUST_TURBO = -2300;
export const MAX_UP_TURBO = 560;
export const BODY_W = 24;
export const BODY_H = 56;
const HALF = BODY_W / 2;

export function overlaps(b: { x: number; y: number }, s: Rect): boolean {
  return b.x + HALF > s.x && b.x - HALF < s.x + s.w && b.y > s.y && b.y - BODY_H < s.y + s.h;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// One fixed 1/60 s step of movement + jetpack flight. Used by the server AND by client prediction.
export function stepBody(b: Body, dx: number, thrust: boolean, turbo: boolean, solids: Rect[]): void {
  b.vx = clamp(dx, -1, 1) * (turbo ? SPEED_TURBO : SPEED);
  const acc = GRAVITY + (thrust ? (turbo ? THRUST_TURBO : THRUST_ACC) : 0);
  b.vy = clamp(b.vy + acc * FIXED_DT, -(turbo ? MAX_UP_TURBO : MAX_UP), MAX_DOWN);

  // sideways: only stop at a solid we actually moved into from outside
  const vx = b.vx;
  const px = b.x;
  b.x += vx * FIXED_DT;
  for (const s of solids) {
    if (!overlaps(b, s)) continue;
    if (vx > 0 && px + HALF <= s.x + 0.01) b.x = s.x - HALF;
    else if (vx < 0 && px - HALF >= s.x + s.w - 0.01) b.x = s.x + s.w + HALF;
    else continue;
    b.vx = 0;
  }

  // up and down: land on tops, bump heads on undersides
  const vy = b.vy;
  const py = b.y;
  b.y += vy * FIXED_DT;
  b.onGround = false;
  for (const s of solids) {
    if (!overlaps(b, s)) continue;
    if (vy >= 0 && py <= s.y + 0.01) { b.y = s.y; b.onGround = true; b.vy = 0; }
    else if (vy < 0 && py - BODY_H >= s.y + s.h - 0.01) { b.y = s.y + s.h + BODY_H; b.vy = 0; }
  }
}

export interface Bounds { W: number; killTop: number; killBottom: number }
export function outOfBounds(b: { x: number; y: number }, m: Bounds): boolean {
  return b.x < 0 || b.x > m.W || b.y < m.killTop || b.y > m.killBottom;
}

// Does the segment (x0,y0)-(x1,y1) touch the rectangle? Returns the fraction 0..1 along the segment, or null.
export function segHit(x0: number, y0: number, x1: number, y1: number, r: Rect): number | null {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < 1e-9) { if (x0 < r.x || x0 > r.x + r.w) return null; }
  else {
    let t1 = (r.x - x0) / dx; let t2 = (r.x + r.w - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) { if (y0 < r.y || y0 > r.y + r.h) return null; }
  else {
    let t1 = (r.y - y0) / dy; let t2 = (r.y + r.h - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
