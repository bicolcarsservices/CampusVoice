import { Room, Client } from 'colyseus';
import {
  Body, InputCmd, Rect, FIXED_DT, GRAVITY, BODY_W, BODY_H,
  stepBody, outOfBounds, overlaps, segHit,
} from './shared/sim';
import {
  WEAPONS, BOMBS, WeaponKey, BombKind, PickupType, PickupCat, START_WEAPON, MAX_SLOTS, PICKUP_COUNTS,
  PICKUP_RESPAWN_MS, DROP_LIFETIME_MS, GUN_WEIGHTS, isWeapon, catOf,
} from './shared/weapons';
import { MapDef, MAP_IDS, getMap } from './shared/maps';
import {
  Mode, MAX_PLAYERS, MIN_PLAYERS, ROUND_CHOICES, TARGET_CHOICES, TEAM_NAMES,
  BOUNDARY_DAMAGE_PER_SECOND,
} from './shared/rules';

const TICK_MS = FIXED_DT * 1000;
const SNAPSHOT_EVERY = 3;          // 20 snapshots per second
const RESPAWN_MS = 2000;
const SPAWN_PROTECTION_MS = 2000;
const RECONNECT_SECONDS = 15;
const ROUND_END_MS = 8000;
const SERIES_END_MS = 12000;
const JOIN_MESSAGE_DELAY_MS = 150;
const MAX_HP = 100;
const TURBO_MS = 6000;
const MAX_BOMBS = 5;
const PICKUP_RADIUS = 38;

type Phase = 'play' | 'roundEnd' | 'seriesEnd';
interface Slot { k: WeaponKey; ammo: number; reserve: number }   // reserve -1 = unlimited (pistol)

interface Player {
  id: string; name: string; body: Body; aim: number; thrust: boolean;
  dead: boolean; respawnAt: number; connected: boolean;
  queue: InputCmd[]; lastInput: InputCmd; lastSeq: number; ack: number;
  tokens: number; lastRefill: number; violations: number;
  hp: number; slots: Slot[]; cur: number;
  bombs: number; bombKind: BombKind; turboUntil: number;
  nextShot: number; reloadUntil: number; invUntil: number; pickNow: boolean;
  team: number;                       // -1 free-for-all, 0 blue, 1 red
  kills: number; deaths: number; totalKills: number; wins: number;
}
interface Bullet { id: number; owner: string; w: WeaponKey; x: number; y: number; vx: number; vy: number; ttl: number }
interface BombObj { id: number; owner: string; kind: BombKind; x: number; y: number; vx: number; vy: number; fuse: number }
interface Pickup {
  id: number; type: PickupType; x: number; y: number; vy: number;   // y = the ground under the item
  spawn: boolean;                                                   // true = lying on the map, false = dropped by a player
  lockUntil: number; expireAt: number; ammo?: number; reserve?: number;
}
interface ChatEntry { id: string; name: string; text: string; at: number }

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 14) : '';
  return s || fallback;
}

const chestY = (p: Player) => p.body.y - 30;
const hitBox = (p: Player): Rect => ({ x: p.body.x - BODY_W / 2 - 2, y: p.body.y - BODY_H - 2, w: BODY_W + 4, h: BODY_H + 4 });
const pointInSolid = (solids: Rect[], x: number, y: number) => solids.some((s) => x > s.x - 5 && x < s.x + s.w + 5 && y > s.y - 5 && y < s.y + s.h + 5);

export class ArenaRoom extends Room {
  maxClients = 5;

  private mode: Mode = 'ffa';
  private rounds = 3;
  private target = 10;
  private mapChoice = 'random';
  private map!: MapDef;
  private roundNo = 1;
  private phase: Phase = 'play';
  private phaseUntil = 0;
  private isPublic = false;
  private started = false;
  private starting = false;
  private matchmakingUntil = 0;
  private elimination = false;
  private teamKills = [0, 0];
  private teamWins = [0, 0];

  private players = new Map<string, Player>();
  private bullets: Bullet[] = [];
  private bombs: BombObj[] = [];
  private pickups = new Map<number, Pickup>();
  private respawnQueue: { cat: PickupCat; at: number; avoidX: number; avoidY: number }[] = [];
  private nextId = 1;
  private acc = 0;
  private tick = 0;
  private code = 'PUBLIC';
  private joined = 0;
  private chatHistory: ChatEntry[] = [];
  private lastChatAt = new Map<string, number>();

  onCreate(options: any) {
    this.code = typeof options?.code === 'string' ? options.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PUBLIC' : 'PUBLIC';
    this.isPublic = this.code === 'PUBLIC';
    this.elimination = this.isPublic;
    this.mode = this.isPublic || options?.mode === 'teams' ? 'teams' : 'ffa';
    const cap = MAX_PLAYERS[this.mode];
    const wanted = Math.floor(num(options?.maxPlayers, Number(process.env.MAX_PLAYERS) || cap));
    this.maxClients = this.isPublic ? cap : clamp(wanted, MIN_PLAYERS, cap);
    this.rounds = this.isPublic ? 7 : (ROUND_CHOICES.includes(options?.rounds) ? options.rounds : 3);
    this.target = TARGET_CHOICES.includes(options?.target) ? options.target : 10;
    if (this.isPublic) this.target = 10;
    this.mapChoice = this.isPublic ? 'random' : (typeof options?.map === 'string' && MAP_IDS.includes(options.map) ? options.map : 'random');
    this.map = getMap(this.mapChoice === 'random' ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : this.mapChoice);
    this.setMetadata({ code: this.code, maxPlayers: this.maxClients, map: this.map.id, mode: this.mode });
    this.setupPickups();

    this.onMessage('inputs', (client, msg) => this.handleInputs(client, msg));
    this.onMessage('chat-send', (client, msg) => this.handleChat(client, msg));
    this.onMessage('rtc-signal', (client, msg) => this.relayVoiceSignal(client, msg));
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
    console.log(`[room ${this.roomId}] created, code=${this.code}, mode=${this.mode}, rounds=${this.rounds}, target=${this.target}, map=${this.map.id}, max=${this.maxClients}`);
  }

  private welcomeFor(id: string, started = this.started) {
    return {
      id, code: this.code, maxPlayers: this.maxClients, map: this.map.id, mode: this.mode,
      rounds: this.rounds, target: this.target, round: this.roundNo, started,
      players: [...this.players.values()].map((o) => ({ id: o.id, name: o.name, team: o.team })),
      count: this.players.size,
    };
  }

  onJoin(client: Client, options: any) {
    this.joined++;
    const counts = [0, 0];
    this.players.forEach((o) => { if (o.team >= 0) counts[o.team]++; });
    const team = this.mode === 'teams' ? (counts[0] <= counts[1] ? 0 : 1) : -1;
    const p = this.makePlayer(client.sessionId, cleanName(options?.name, `Soldier${this.joined}`), team);
    this.players.set(client.sessionId, p);
    if (this.isPublic && this.players.size === 1) this.matchmakingUntil = Date.now() + 8000;
    const readyToStart = this.clients.length >= this.maxClients;
    setTimeout(() => {
      void (async () => {
        if (!this.clients.some((member) => member.sessionId === client.sessionId)) return;
        this.sendRoster();
        if (readyToStart) await this.startMatch();
        client.send('welcome', this.welcomeFor(client.sessionId));
        client.send('chat-history', this.chatHistory);
        if (!this.started) this.sendLobby();
      })();
    }, JOIN_MESSAGE_DELAY_MS);
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    if (!consented) {
      p.connected = false;
      try {
        const back = await this.allowReconnection(client, RECONNECT_SECONDS);
        p.connected = true;
        setTimeout(() => {
          back.send('welcome', this.welcomeFor(client.sessionId));
          back.send('chat-history', this.chatHistory);
          this.sendRoster();
        }, JOIN_MESSAGE_DELAY_MS);
        return;
      } catch { /* did not come back in time */ }
    }
    this.players.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.sendRoster();
    if (!this.started) this.sendLobby();
    else if (this.elimination) this.checkRoundEnd(p, Date.now());
  }

  onDispose() { console.log(`[room ${this.roomId}] disposed`); }

  // ---------- players ----------
  private freshSlots(): Slot[] {
    const w = WEAPONS[START_WEAPON];
    return [{ k: START_WEAPON, ammo: w.mag, reserve: -1 }];
  }

  private makePlayer(id: string, name: string, team: number): Player {
    const zero: InputCmd = { seq: 0, dx: 0, thrust: false, aim: 0, fire: false, bomb: false, reload: false, pick: false, sel: -1 };
    const p: Player = {
      id, name, body: { x: 0, y: 0, vx: 0, vy: 0, onGround: true }, aim: 0, thrust: false,
      dead: false, respawnAt: 0, connected: true, queue: [], lastInput: zero, lastSeq: 0, ack: 0,
      tokens: 60, lastRefill: Date.now(), violations: 0,
      hp: MAX_HP, slots: this.freshSlots(), cur: 0, bombs: 2, bombKind: 'grenade', turboUntil: 0,
      nextShot: 0, reloadUntil: 0, invUntil: Date.now() + SPAWN_PROTECTION_MS, pickNow: false,
      team, kills: 0, deaths: 0, totalKills: 0, wins: 0,
    };
    const [sx, sy] = this.pickSpawn(p);
    p.body = { x: sx, y: sy, vx: 0, vy: 0, onGround: true };
    return p;
  }

  private respawn(p: Player, now: number) {
    const [x, y] = this.pickSpawn(p);
    p.body = { x, y, vx: 0, vy: 0, onGround: true };
    p.dead = false; p.queue.length = 0; p.ack = p.lastSeq;
    p.lastInput = { seq: p.lastSeq, dx: 0, thrust: false, aim: 0, fire: false, bomb: false, reload: false, pick: false, sel: -1 };
    p.hp = MAX_HP; p.slots = this.freshSlots(); p.cur = 0;
    p.bombs = 2; p.bombKind = 'grenade'; p.turboUntil = 0; p.reloadUntil = 0; p.nextShot = 0;
    p.invUntil = now + SPAWN_PROTECTION_MS;
  }

  private isAlly(a: Player | undefined, b: Player): boolean {
    return !!a && this.mode === 'teams' && a.id !== b.id && a.team === b.team;
  }

  private pickSpawn(p: Player): [number, number] {
    const m = this.map;
    const free = m.spawns.filter(([x, y]) => !m.solids.some((s) => overlaps({ x, y: y - 0.01 }, s)));
    let pool = free.length ? free : m.spawns;
    if (this.mode === 'teams' && p.team >= 0) {                 // each team starts on its own side of the map
      const side = pool.filter(([x]) => (p.team === 0 ? x < m.W / 2 : x >= m.W / 2));
      if (side.length) pool = side;
    }
    // do not spawn on top of an item (it would be picked up by accident)
    const items = [...this.pickups.values()].filter((x) => x.spawn);
    const apart = pool.filter(([x, y]) => !items.some((it) => Math.abs(it.x - x) < 90 && Math.abs(it.y - y) < 100));
    if (apart.length) pool = apart;
    const enemies = [...this.players.values()].filter((o) => o.id !== p.id && !o.dead && !this.isAlly(p, o));
    let best = pool[0];
    let bestScore = -1;
    for (const sp of pool) {
      const score = enemies.length ? Math.min(...enemies.map((o) => Math.hypot(o.body.x - sp[0], o.body.y - sp[1]))) : Math.random();
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return best;
  }

  // ---------- input from clients (never trusted) ----------
  private handleInputs(client: Client, msg: any) {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    p.tokens = Math.min(60, p.tokens + ((now - p.lastRefill) / 1000) * 40);
    p.lastRefill = now;
    if (p.tokens < 1) { if (++p.violations > 150) client.leave(4002, 'Too many messages'); return; }
    p.tokens -= 1;

    const list = msg?.i;
    if (!Array.isArray(list) || list.length === 0 || list.length > 10) return;
    for (const c of list) {
      const seq = Math.floor(num(c?.seq, -1));
      if (seq <= p.lastSeq || seq - p.lastSeq > 1000) continue;
      p.lastSeq = seq;
      if (p.queue.length >= 30) p.queue.shift();
      p.queue.push({
        seq,
        dx: clamp(num(c?.dx), -1, 1),
        thrust: c?.thrust === true,
        aim: clamp(num(c?.aim), -7, 7),
        fire: c?.fire === true, bomb: c?.bomb === true, reload: c?.reload === true, pick: c?.pick === true,
        sel: Math.floor(clamp(num(c?.sel, -1), -1, MAX_SLOTS - 1)),
      });
    }
  }

  // ---------- simulation ----------
  private update(deltaMs: number) {
    if (!this.started) {
      const connected = [...this.players.values()].filter((p) => p.connected).length;
      if (this.isPublic && connected >= MIN_PLAYERS &&
        (connected >= this.maxClients || Date.now() >= this.matchmakingUntil)) void this.startMatch();
      if (!this.started) return;
    }
    this.acc = Math.min(this.acc + deltaMs, 250);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.step(Date.now());
      if (++this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshot(Date.now());
    }
  }

  private get paused() { return this.phase !== 'play'; }

  private step(now: number) {
    if (this.phase !== 'play' && now >= this.phaseUntil) this.startNextRound(now);
    if (this.isPublic && this.phase === 'seriesEnd') return;

    for (const p of this.players.values()) {
      if (p.dead) {
        p.queue.length = 0; p.ack = p.lastSeq;
        if (!this.elimination && now >= p.respawnAt) this.respawn(p, now);
        continue;
      }
      const steps = p.queue.length > 4 ? 2 : 1;
      for (let k = 0; k < steps; k++) {
        const fresh = p.queue.shift();
        let cmd: InputCmd = fresh ?? p.lastInput;
        if (fresh) { p.lastInput = fresh; p.ack = fresh.seq; }
        if (!p.connected) cmd = { ...cmd, dx: 0, thrust: false, fire: false };
        p.aim = cmd.aim; p.thrust = cmd.thrust;
        stepBody(p.body, cmd.dx, cmd.thrust, now < p.turboUntil, this.map.solids);
        if (fresh) {
          if (cmd.sel >= 0 && cmd.sel < p.slots.length && cmd.sel !== p.cur) { p.cur = cmd.sel; p.reloadUntil = 0; p.nextShot = Math.max(p.nextShot, now + 250); }
          if (cmd.reload) this.startReload(p, now);
          if (cmd.bomb) this.throwBomb(p);
          if (cmd.pick) p.pickNow = true;
        }
        if (cmd.fire) this.tryFire(p, now);
        if (outOfBounds(p.body, this.map)) {
          p.hp = Math.max(0, p.hp - BOUNDARY_DAMAGE_PER_SECOND * FIXED_DT);
          if (p.hp <= 0) {
            this.kill(p, null, 'out', now);
            break;
          }
        }
      }
      if (p.reloadUntil && now >= p.reloadUntil) this.finishReload(p);
    }
    this.stepBullets(now);
    this.stepBombs(now);
    this.stepPickups(now);
    this.players.forEach((p) => { p.pickNow = false; });
  }

  // ---------- rounds ----------
  private checkRoundEnd(killer: Player, now: number) {
    if (this.phase !== 'play') return;
    if (this.elimination) {
      const alive = [0, 0];
      this.players.forEach((p) => {
        if (p.team < 0) return;
        if (!p.dead) alive[p.team]++;
      });
      if (alive[0] === 0 && alive[1] > 0) this.endRound(now, undefined, 1);
      else if (alive[1] === 0 && alive[0] > 0) this.endRound(now, undefined, 0);
      return;
    }
    if (this.mode === 'ffa' && killer.kills >= this.target) this.endRound(now, killer, -1);
    else if (this.mode === 'teams' && this.teamKills[killer.team] >= this.target) this.endRound(now, undefined, killer.team);
  }

  private endRound(now: number, winner: Player | undefined, winnerTeam: number) {
    if (winnerTeam >= 0) this.teamWins[winnerTeam]++;
    else if (winner) winner.wins++;
    const last = this.roundNo >= this.rounds;
    this.phase = last ? 'seriesEnd' : 'roundEnd';
    this.phaseUntil = this.isPublic && last ? Number.POSITIVE_INFINITY : now + (last ? SERIES_END_MS : ROUND_END_MS);

    const list = [...this.players.values()];
    const scores = list.map((o) => ({ id: o.id, name: o.name, k: o.kills, d: o.deaths, w: o.wins, t: o.team })).sort((a, b) => b.k - a.k || a.d - b.d);
    let champion = '';
    if (last) {
      if (this.mode === 'teams') champion = this.teamWins[0] === this.teamWins[1] ? 'DRAW' : `${TEAM_NAMES[this.teamWins[0] > this.teamWins[1] ? 0 : 1]} TEAM`;
      else {
        const ranked = [...list].sort((a, b) => b.wins - a.wins || b.totalKills - a.totalKills);
        champion = ranked.length ? ranked[0].name : '';
      }
    }
    this.broadcast('event', {
      type: 'roundEnd', n: this.roundNo, rounds: this.rounds, series: last, champion,
      winnerName: winnerTeam >= 0 ? `${TEAM_NAMES[winnerTeam]} TEAM` : (winner?.name ?? ''), winnerId: winner?.id ?? '', winnerTeam,
      scores, tw: this.teamWins, next: (last ? SERIES_END_MS : ROUND_END_MS) / 1000,
    });
  }

  private startNextRound(now: number) {
    if (this.phase === 'seriesEnd') {            // a new series starts
      this.roundNo = 0;
      this.teamWins = [0, 0];
      this.players.forEach((p) => { p.wins = 0; p.totalKills = 0; });
    }
    this.roundNo++;
    if (this.mapChoice === 'random') {           // every round is played on a different map
      const others = MAP_IDS.filter((id) => id !== this.map.id);
      this.map = getMap(others[Math.floor(Math.random() * others.length)] ?? MAP_IDS[0]);
    }
    this.phase = 'play';
    this.teamKills = [0, 0];
    this.bullets.length = 0; this.bombs.length = 0;
    this.setupPickups();
    this.players.forEach((p) => { p.kills = 0; p.deaths = 0; this.respawn(p, now); });
    this.broadcast('event', { type: 'round', n: this.roundNo, rounds: this.rounds, map: this.map.id, mode: this.mode, target: this.target });
  }

  // ---------- weapons ----------
  private slot(p: Player): Slot { return p.slots[p.cur]; }

  private tryFire(p: Player, now: number) {
    if (this.paused || now < p.nextShot || now < p.reloadUntil) return;
    const s = this.slot(p);
    const w = WEAPONS[s.k];
    p.nextShot = now + w.rate;

    if (w.kind === 'melee') { this.melee(p, now); return; }
    if (s.ammo <= 0) { this.startReload(p, now); return; }
    s.ammo--;
    const a = p.aim + (Math.random() - 0.5) * 2 * w.spread;
    const cx = p.body.x + Math.cos(p.aim) * 10;
    const cy = chestY(p) + Math.sin(p.aim) * 10;
    const b: Bullet = { id: this.nextId++, owner: p.id, w: s.k, x: cx, y: cy, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, ttl: w.life };
    this.bullets.push(b);
    this.broadcast('event', { type: 'shot', id: b.id, o: p.id, x: round(cx, 1), y: round(cy, 1), vx: round(b.vx, 1), vy: round(b.vy, 1), ttl: w.life, w: s.k });
    if (s.ammo <= 0) this.startReload(p, now);
  }

  private melee(p: Player, now: number) {
    const w = WEAPONS.knife;
    const cx = p.body.x; const cy = chestY(p);
    let best: Player | null = null; let bestD = 1e9;
    for (const o of this.players.values()) {
      if (o.id === p.id || o.dead || this.isAlly(p, o)) continue;
      const dx = o.body.x - cx; const dy = o.body.y - 28 - cy;
      const d = Math.hypot(dx, dy);
      let diff = Math.abs(Math.atan2(dy, dx) - p.aim); if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (d <= (w.range ?? 60) + 14 && diff < 1.0 && d < bestD) { best = o; bestD = d; }
    }
    this.broadcast('event', { type: 'melee', o: p.id, x: round(cx, 1), y: round(cy, 1), a: round(p.aim, 2) });
    if (best) this.damage(best, w.dmg, p.id, 'knife', now);
  }

  private startReload(p: Player, now: number) {
    const s = this.slot(p);
    const w = WEAPONS[s.k];
    if (w.kind === 'melee' || p.reloadUntil || s.ammo >= w.mag) return;
    if (!w.infinite && s.reserve <= 0) return;
    p.reloadUntil = now + w.reload;
  }

  private finishReload(p: Player) {
    const s = this.slot(p);
    const w = WEAPONS[s.k];
    if (w.infinite) s.ammo = w.mag;
    else { const take = Math.min(w.mag - s.ammo, s.reserve); s.ammo += take; s.reserve -= take; }
    p.reloadUntil = 0;
  }

  private throwBomb(p: Player) {
    if (this.paused || p.bombs <= 0) return;
    p.bombs--;
    const b = BOMBS[p.bombKind];
    this.bombs.push({
      id: this.nextId++, owner: p.id, kind: p.bombKind,
      x: p.body.x + Math.cos(p.aim) * 18, y: chestY(p) + Math.sin(p.aim) * 18,
      vx: Math.cos(p.aim) * 520 + p.body.vx * 0.4, vy: Math.sin(p.aim) * 520 - 120, fuse: b.fuse,
    });
  }

  private stepBullets(now: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const owner = this.players.get(b.owner);
      const x0 = b.x; const y0 = b.y;
      const x1 = x0 + b.vx * FIXED_DT; const y1 = y0 + b.vy * FIXED_DT;
      let tBest = 2; let victim: Player | null = null;
      for (const s of this.map.solids) { const t = segHit(x0, y0, x1, y1, s); if (t !== null && t < tBest) { tBest = t; victim = null; } }
      for (const o of this.players.values()) {
        if (o.id === b.owner || o.dead || this.isAlly(owner, o)) continue;   // bullets pass through teammates
        const t = segHit(x0, y0, x1, y1, hitBox(o));
        if (t !== null && t < tBest) { tBest = t; victim = o; }
      }
      if (tBest <= 1) {
        const hx = x0 + (x1 - x0) * tBest; const hy = y0 + (y1 - y0) * tBest;
        const def = WEAPONS[b.w];
        this.broadcast('event', { type: 'hit', b: b.id, x: round(hx, 1), y: round(hy, 1), t: victim?.id ?? '' });
        if (def.kind === 'rocket') this.explode(hx, hy, def.radius ?? 120, def.dmg, b.owner, b.w, now);
        else if (victim) this.damage(victim, def.dmg, b.owner, b.w, now);
        this.bullets.splice(i, 1);
        continue;
      }
      b.x = x1; b.y = y1; b.ttl -= FIXED_DT;
      if (b.ttl <= 0) {
        const def = WEAPONS[b.w];
        this.broadcast('event', { type: 'hit', b: b.id, x: round(b.x, 1), y: round(b.y, 1), t: '' });
        if (def.kind === 'rocket') this.explode(b.x, b.y, def.radius ?? 120, def.dmg, b.owner, b.w, now);
        this.bullets.splice(i, 1);
      }
    }
  }

  private stepBombs(now: number) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy += GRAVITY * FIXED_DT;
      b.x += b.vx * FIXED_DT;
      if (pointInSolid(this.map.solids, b.x, b.y)) { b.x -= b.vx * FIXED_DT; b.vx *= -0.45; }
      b.y += b.vy * FIXED_DT;
      if (pointInSolid(this.map.solids, b.x, b.y)) { b.y -= b.vy * FIXED_DT; b.vy *= -0.4; if (Math.abs(b.vy) < 30) b.vy = 0; b.vx *= 0.8; }
      b.fuse -= FIXED_DT;
      if (b.fuse <= 0 || outOfBounds({ x: b.x, y: b.y }, this.map)) {
        const def = BOMBS[b.kind];
        if (b.fuse <= 0) this.explode(b.x, b.y, def.radius, def.dmg, b.owner, b.kind, now);
        this.bombs.splice(i, 1);
      }
    }
  }

  private explode(x: number, y: number, radius: number, dmg: number, owner: string, w: string, now: number) {
    this.broadcast('event', { type: 'boom', x: round(x, 1), y: round(y, 1), r: radius });
    const thrower = this.players.get(owner);
    for (const o of this.players.values()) {
      if (o.dead || this.isAlly(thrower, o)) continue;       // no damage to teammates
      const d = Math.hypot(o.body.x - x, o.body.y - 28 - y);
      if (d >= radius) continue;
      let amount = dmg * (1 - 0.6 * (d / radius));
      if (o.id === owner) amount *= 0.5;
      this.damage(o, Math.round(amount), owner, w, now);
    }
  }

  private damage(target: Player, amount: number, killerId: string, w: string, now: number) {
    if (this.paused || target.dead || now < target.invUntil || amount <= 0) return;
    target.hp -= amount;
    if (target.hp <= 0) this.kill(target, killerId, w, now);
  }

  private kill(victim: Player, killerId: string | null, w: string, now: number) {
    if (victim.dead) return;
    victim.dead = true; victim.deaths++; victim.hp = 0; victim.respawnAt = now + RESPAWN_MS;
    victim.reloadUntil = 0;
    const killer = killerId ? this.players.get(killerId) : undefined;
    const counted = !!killer && killer.id !== victim.id && !this.isAlly(killer, victim) && !this.paused;
    if (counted && killer) { killer.kills++; killer.totalKills++; if (killer.team >= 0) this.teamKills[killer.team]++; }
    if (w !== 'out') this.dropWeapons(victim, now);
    this.broadcast('event', { type: 'kill', k: killer ? killer.id : '', v: victim.id, w, kt: killer ? killer.team : -1, vt: victim.team });
    if (this.elimination) this.checkRoundEnd(killer ?? victim, now);
    else if (counted && killer) this.checkRoundEnd(killer, now);
  }

  // ---------- items lying on the map ----------
  // Only a few items lie around at a time (see PICKUP_COUNTS). Once one is taken, a new one of the same kind
  // appears after 3 minutes, at a different spot.
  private setupPickups() {
    this.pickups.clear();
    this.respawnQueue.length = 0;
    (Object.keys(PICKUP_COUNTS) as PickupCat[]).forEach((cat) => { for (let i = 0; i < PICKUP_COUNTS[cat]; i++) this.spawnItem(cat); });
  }

  private pickSpot(avoidX: number, avoidY: number): [number, number] {
    const taken = [...this.pickups.values()].filter((x) => x.spawn);
    const spots = this.map.pickupSpots;
    const ok = spots.filter(([x, y]) => !taken.some((t) => Math.abs(t.x - x) < 140 && Math.abs(t.y - y) < 110) && !(Math.abs(avoidX - x) < 80 && Math.abs(avoidY - y) < 80));
    const pool = ok.length ? ok : spots;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private randomType(cat: PickupCat): PickupType {
    if (cat === 'turbo') return 'turbo';
    if (cat === 'bomb') return Math.random() < 0.5 ? 'grenade' : 'pineapple';
    const total = GUN_WEIGHTS.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of GUN_WEIGHTS) { r -= w; if (r <= 0) return k; }
    return GUN_WEIGHTS[0][0];
  }

  private spawnItem(cat: PickupCat, avoidX = -9999, avoidY = -9999) {
    const [x, y] = this.pickSpot(avoidX, avoidY);
    const id = this.nextId++;
    this.pickups.set(id, { id, type: this.randomType(cat), x, y, vy: 0, spawn: true, lockUntil: 0, expireAt: 0 });
  }

  private dropWeapons(p: Player, now: number) {
    p.slots.forEach((s, i) => {
      if (s.k === START_WEAPON) return;                // everyone has a pistol, so it is not dropped
      const id = this.nextId++;
      this.pickups.set(id, {
        id, type: s.k, x: p.body.x + (i - 1) * 26, y: p.body.y, vy: -220, spawn: false,
        lockUntil: now + 600, expireAt: now + DROP_LIFETIME_MS, ammo: s.ammo, reserve: s.reserve,
      });
    });
  }

  private stepPickups(now: number) {
    while (this.respawnQueue.length && this.respawnQueue[0].at <= now) {
      const r = this.respawnQueue.shift()!;
      this.spawnItem(r.cat, r.avoidX, r.avoidY);
    }
    for (const pk of this.pickups.values()) {
      if (!pk.spawn && now >= pk.expireAt) { this.pickups.delete(pk.id); continue; }
      if (!pk.spawn) {                                    // dropped guns fall until they land
        const solids = this.map.solids;
        if (pk.vy !== 0 || !solids.some((s) => pk.x > s.x && pk.x < s.x + s.w && Math.abs(pk.y - s.y) < 1)) {
          pk.vy += GRAVITY * FIXED_DT;
          const ny = pk.y + pk.vy * FIXED_DT;
          const floor = solids.find((s) => pk.x > s.x && pk.x < s.x + s.w && pk.y <= s.y + 1 && ny >= s.y);
          if (floor && pk.vy > 0) { pk.y = floor.y; pk.vy = 0; } else pk.y = ny;
          if (outOfBounds({ x: pk.x, y: pk.y }, this.map)) { this.pickups.delete(pk.id); continue; }
        }
      }
      if (now < pk.lockUntil || this.paused) continue;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (Math.hypot(p.body.x - pk.x, (p.body.y - 28) - (pk.y - 14)) < PICKUP_RADIUS && this.collect(p, pk, now)) break;
      }
    }
  }

  // Returns true when the player took the item.
  private collect(p: Player, pk: Pickup, now: number): boolean {
    const t = pk.type;
    if (isWeapon(t)) {
      const def = WEAPONS[t];
      const have = p.slots.find((s) => s.k === t);
      if (have) {                                         // same gun: just refill it
        have.ammo = def.mag; if (!def.infinite) have.reserve = Math.max(have.reserve, def.reserve);
      } else if (p.slots.length < MAX_SLOTS) {            // free slot: carry it too and use it
        p.slots.push({ k: t, ammo: pk.ammo ?? def.mag, reserve: pk.reserve ?? def.reserve });
        p.cur = p.slots.length - 1; p.reloadUntil = 0; p.nextShot = now + 250;
      } else if (p.pickNow) {                             // bag full: swap only when the player asks to (E / PICK)
        const idx = p.slots[p.cur].k === START_WEAPON ? 1 : p.cur;
        const old = p.slots[idx];
        const dropId = this.nextId++;
        this.pickups.set(dropId, { id: dropId, type: old.k, x: p.body.x, y: p.body.y, vy: -150, spawn: false, lockUntil: now + 800, expireAt: now + DROP_LIFETIME_MS, ammo: old.ammo, reserve: old.reserve });
        p.slots[idx] = { k: t, ammo: pk.ammo ?? def.mag, reserve: pk.reserve ?? def.reserve };
        p.cur = idx; p.reloadUntil = 0; p.nextShot = now + 250;
      } else return false;
    } else if (t === 'turbo') p.turboUntil = now + TURBO_MS;
    else { p.bombs = Math.min(MAX_BOMBS, p.bombs + 2); p.bombKind = t; }

    this.pickups.delete(pk.id);
    if (pk.spawn) this.respawnQueue.push({ cat: catOf(t), at: now + PICKUP_RESPAWN_MS, avoidX: pk.x, avoidY: pk.y });
    return true;
  }

  // ---------- snapshots ----------
  private sendSnapshot(now: number) {
    const p = [...this.players.values()].map((o) => {
      const s = this.slot(o);
      return {
        id: o.id, x: round(o.body.x, 1), y: round(o.body.y, 1), vx: round(o.body.vx, 1), vy: round(o.body.vy, 1),
        a: round(o.aim, 2), g: o.body.onGround, th: o.thrust, d: o.dead, ack: o.ack,
        hp: Math.max(0, Math.round(o.hp)), w: s.k, am: s.ammo, rs: s.reserve, bm: o.bombs, bk: o.bombKind,
        tb: Math.max(0, o.turboUntil - now), k: o.kills, de: o.deaths, iv: now < o.invUntil, rl: o.reloadUntil > 0,
        tm: o.team, wn: o.wins, cu: o.cur, ws: o.slots.map((x) => [x.k, x.ammo, x.reserve]),
      };
    });
    const pk = [...this.pickups.values()].map((x) => [x.id, x.type, round(x.x, 1), round(x.y, 1)]);
    const bm = this.bombs.map((b) => [b.id, round(b.x, 1), round(b.y, 1), b.kind]);
    this.broadcast('snap', { t: now, ph: this.phase, rn: this.roundNo, tk: this.teamKills, tw: this.teamWins, p, pk, bm });
  }

  private sendRoster() {
    const players = [...this.players.values()].map((o) => ({ id: o.id, name: o.name, team: o.team }));
    this.broadcast('roster', { players });
  }

  private sendLobby() {
    const players = [...this.players.values()].map((o) => ({ id: o.id, name: o.name, team: o.team }));
    this.broadcast('lobby', {
      players, count: players.length, maxPlayers: this.maxClients, started: this.started, isPublic: this.isPublic,
    });
  }

  private handleChat(client: Client, message: any) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    if (typeof message?.text !== 'string') {
      client.send('chat-error', { message: 'Message must be plain text.' });
      return;
    }
    const text = message.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!text || text.length > 240) {
      client.send('chat-error', { message: 'Messages must be between 1 and 240 characters.' });
      return;
    }
    const now = Date.now();
    if (now - (this.lastChatAt.get(client.sessionId) ?? 0) < 600) {
      client.send('chat-error', { message: 'Please wait before sending another message.' });
      return;
    }
    this.lastChatAt.set(client.sessionId, now);
    const entry = { id: player.id, name: player.name, text, at: now };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > 50) this.chatHistory.shift();
    this.broadcast('chat', entry);
  }

  private relayVoiceSignal(client: Client, message: any) {
    const sender = this.players.get(client.sessionId);
    const recipientId = typeof message?.to === 'string' ? message.to : '';
    const recipient = this.players.get(recipientId);
    const targetClient = this.clients.find((member) => member.sessionId === recipientId);
    if (!this.started || this.mode !== 'teams' || !sender || !recipient || !targetClient ||
      sender.team < 0 || sender.team !== recipient.team || sender.id === recipient.id) {
      if (sender) client.send('rtc-error', { message: 'Team voice signaling is only allowed between teammates in a live team match.' });
      return;
    }

    if (message.description !== undefined) {
      const description = message.description;
      if (!description || !['offer', 'answer'].includes(description.type) ||
        typeof description.sdp !== 'string' || description.sdp.length > 20000) {
        client.send('rtc-error', { message: 'Invalid voice connection description.' });
        return;
      }
      targetClient.send('rtc-signal', { from: sender.id, description });
    } else if (message.candidate !== undefined) {
      const candidate = message.candidate;
      if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 3000 ||
        (candidate.sdpMid !== null && candidate.sdpMid !== undefined &&
          (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) ||
        (candidate.sdpMLineIndex !== null && candidate.sdpMLineIndex !== undefined &&
          (typeof candidate.sdpMLineIndex !== 'number' || !Number.isInteger(candidate.sdpMLineIndex)))) {
        client.send('rtc-error', { message: 'Invalid voice connection candidate.' });
        return;
      }
      targetClient.send('rtc-signal', { from: sender.id, candidate });
    } else {
      client.send('rtc-error', { message: 'Empty voice connection signal.' });
    }
  }

  private async startMatch() {
    if (this.started || this.starting) return;
    this.starting = true;
    try {
      await this.lock();
    } catch (error) {
      this.starting = false;
      console.error(`[room ${this.roomId}] could not lock before starting`, error);
      return;
    }
    this.starting = false;
    this.started = true;
    setTimeout(() => {
      this.sendLobby();
      this.broadcast('start', {});
    }, 0);
  }
}
