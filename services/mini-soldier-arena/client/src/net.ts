import type { Room } from 'colyseus.js';
import type { InputCmd } from './shared/sim';
import type { WeaponKey, BombKind, PickupType } from './shared/weapons';
import type { Mode } from './shared/rules';

export interface Welcome {
  id: string; code: string; maxPlayers: number; map: string; mode: Mode; rounds: number; target: number; round: number;
  started?: boolean; players?: RosterEntry[]; count?: number;
}
export interface RosterEntry { id: string; name: string; team: number }
export interface LobbyState { players: RosterEntry[]; count: number; maxPlayers: number; started: boolean }
export type Phase = 'play' | 'roundEnd' | 'seriesEnd';
export interface SnapPlayer {
  id: string; x: number; y: number; vx: number; vy: number; a: number; g: boolean; th: boolean; d: boolean; ack: number;
  hp: number; w: WeaponKey; am: number; rs: number; bm: number; bk: BombKind; tb: number; k: number; de: number; iv: boolean; rl: boolean;
  tm: number; wn: number; cu: number; ws: [WeaponKey, number, number][];
}
export type PickupRow = [number, PickupType, number, number];       // id, type, x, y (the ground under it)
export type BombRow = [number, number, number, BombKind];          // id, x, y, kind
export interface Snap { t: number; ph: Phase; rn: number; tk: [number, number]; tw: [number, number]; p: SnapPlayer[]; pk: PickupRow[]; bm: BombRow[] }
export interface GameEvent { type: string; [key: string]: any }
export interface RoundInfo { n: number; rounds: number; target: number; mode: Mode }

// Registers every message handler right after joining, so nothing sent by the server is lost
// while the game scene is still loading.
export class Net {
  welcome: Welcome | null = null;
  roster: RosterEntry[] = [];
  latest: Snap | null = null;
  mapId = '';
  started = false;
  lobby: LobbyState | null = null;
  info: RoundInfo = { n: 1, rounds: 3, target: 10, mode: 'ffa' };
  pendingEvents: GameEvent[] = [];
  onSnap: ((s: Snap) => void) | null = null;
  onEvent: ((e: GameEvent) => void) | null = null;
  onWelcome: ((welcome: Welcome) => void) | null = null;
  onLobby: ((state: LobbyState) => void) | null = null;
  onStart: (() => void) | null = null;

  constructor(public room: Room) {
    room.onMessage('welcome', (m: Welcome) => {
      this.welcome = m; this.mapId = m.map;
      this.started = m.started ?? m.code === 'PUBLIC';
      this.info = { n: m.round, rounds: m.rounds, target: m.target, mode: m.mode };
      this.roster = m.players ?? this.roster;
      this.lobby = {
        players: this.roster, count: m.count ?? this.roster.length,
        maxPlayers: m.maxPlayers, started: this.started,
      };
      this.onWelcome?.(m);
      this.onLobby?.(this.lobby);
    });
    room.onMessage('roster', (m: { players: RosterEntry[] }) => { this.roster = m.players; });
    room.onMessage('lobby', (m: LobbyState) => {
      this.lobby = m;
      this.roster = m.players;
      this.started = m.started;
      this.onLobby?.(m);
    });
    room.onMessage('start', () => {
      this.started = true;
      this.onStart?.();
    });
    room.onMessage('snap', (m: Snap) => { this.latest = m; this.onSnap?.(m); });
    room.onMessage('event', (m: GameEvent) => {
      if (m.type === 'round') {                      // a new round may be on a new map
        this.mapId = m.map;
        this.info = { n: m.n, rounds: m.rounds, target: m.target, mode: m.mode };
      }
      if (this.onEvent) this.onEvent(m); else this.pendingEvents.push(m);
    });
  }

  sendInputs(list: InputCmd[]) {
    this.room.send('inputs', { i: list });
  }
}
