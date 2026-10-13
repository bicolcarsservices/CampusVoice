'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const C = require('./config');
const WORDS = require('./words');

/* ────────────────────────────── persistence ────────────────────────────── */
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
let failSave = false; // test hook

function emptyDb() {
  return { version: 1, players: {}, ledger: [], keys: {}, redemptions: {}, matches: [], flags: [] };
}
function loadDb() {
  try {
    return Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Could not read database, keeping a copy:', e.message);
      try { fs.renameSync(DATA_FILE, DATA_FILE + '.corrupt-' + Date.now()); } catch (_) { /* ignore */ }
    }
    return emptyDb();
  }
}
let db = loadDb();

function saveDb() {
  if (failSave) throw new Error('simulated save failure');
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}
/** Run fn as one all-or-nothing unit: any throw (including a failed disk write) restores the previous state. */
function tx(fn) {
  const snap = JSON.stringify(db);
  try {
    const r = fn();
    saveDb();
    return r;
  } catch (e) {
    db = JSON.parse(snap);
    throw e;
  }
}

const ITEMS = new Map(C.ITEMS.map(i => [i.id, i]));
const publicItem = i => ({ id: i.id, name: i.name, type: i.type, price: i.price, desc: i.desc, style: i.style, maxOwned: i.maxOwned });

function ensureProfile(id, name) {
  let p = db.players[id];
  let dirty = false;
  if (!p) {
    p = db.players[id] = { name, coins: 0, inventory: {}, equipped: {}, createdAt: Date.now(), stats: { matches: 0, wins: 0, coinsEarned: 0, totalScore: 0 } };
    dirty = true;
  } else if (name && p.name !== name) { p.name = name; dirty = true; }
  if (dirty) { try { saveDb(); } catch (e) { console.error('save failed', e.message); } }
  return p;
}
function profileView(id) {
  const p = db.players[id];
  return { name: p.name, coins: p.coins, inventory: p.inventory, equipped: p.equipped, stats: p.stats };
}
function credit(id, amount, type, source, matchId, key) {
  if (!(amount > 0) || !Number.isInteger(amount)) throw new Error('bad credit');
  if (db.keys[key]) return false;
  const p = db.players[id];
  p.coins += amount;
  db.keys[key] = 1;
  db.ledger.push({ id: crypto.randomUUID(), playerId: id, amount, type, source, matchId, key, balanceAfter: p.coins, at: Date.now() });
  if (db.ledger.length > 20000) db.ledger.splice(0, db.ledger.length - 20000);
  return true;
}

/* ────────────────────────────── helpers ────────────────────────────── */
const now = () => Date.now();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const clampInt = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def; };
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const hue = id => parseInt(id.slice(0, 4), 16) % 360;
const pick = arr => arr[crypto.randomInt(arr.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanName(s) {
  if (typeof s !== 'string') return null;
  s = s.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s.length >= 2 ? s : null;
}
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function bucket(cap, rate) { return { cap, rate, tokens: cap, t: now() }; }
function take(b, n = 1) {
  const t = now();
  b.tokens = Math.min(b.cap, b.tokens + (t - b.t) / 1000 * b.rate); b.t = t;
  if (b.tokens >= n) { b.tokens -= n; return true; }
  return false;
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

/* ────────────────────────────── state ────────────────────────────── */
const rooms = new Map();        // code -> room
const playerRoom = new Map();   // playerId -> code
const sockets = new Map();      // playerId -> ws
const clients = new Map();      // ws -> ctx
const createLog = new Map();    // playerId -> [timestamps]

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function sendTo(id, obj) { send(sockets.get(id), obj); }
function err(ctx, message, code) { send(ctx.ws, { type: 'error', message, code }); }

/* ────────────────────────────── rooms ────────────────────────────── */
function cleanConfig(c = {}) {
  return {
    rounds: clampInt(c.rounds, C.ROUNDS.min, C.ROUNDS.max, C.ROUNDS.def),
    drawTime: clampInt(c.drawTime, C.DRAW_TIME.min, C.DRAW_TIME.max, C.DRAW_TIME.def)
  };
}
let joinCounter = 0;
function addPlayer(room, id, name) {
  const p = { id, name, order: joinCounter++, connected: true, dcAt: 0, left: false, score: 0, correct: 0, fast: 0, turnsPresent: 0 };
  room.players.set(id, p);
  playerRoom.set(id, room.code);
  return p;
}
function cosmetics(id) {
  const e = (db.players[id] && db.players[id].equipped) || {};
  return { frame: e.frame || null, badge: e.badge || null, title: e.title || null };
}
function connectedPlayers(room) { return [...room.players.values()].filter(p => p.connected && !p.left); }

function hintArray(t) {
  if (!t.word) return null;
  return [...t.word].map((ch, i) => (ch === ' ' ? ' ' : t.revealed.has(i) ? ch : '_'));
}

function snapshot(room, viewerId) {
  const m = room.match, t = room.turn;
  const players = [...room.players.values()].map(p => ({
    id: p.id, name: p.name, score: p.score, connected: p.connected, left: p.left, hue: hue(p.id),
    host: p.id === room.hostId,
    artist: !!t && room.state === 'DRAWING' && t.artistId === p.id,
    guessed: !!t && t.guessed.has(p.id),
    cos: cosmetics(p.id)
  }));
  let turn = null;
  if (t && ['DRAWING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(room.state)) {
    const reveal = t.word && (room.state !== 'DRAWING' || viewerId === t.artistId || t.guessed.has(viewerId));
    turn = {
      index: t.index, artistId: t.artistId, phase: t.phase,
      endsAt: t.phase === 'choosing' ? t.phaseEndsAt : t.endsAt,
      word: reveal ? t.word : null,
      hint: hintArray(t),
      choices: viewerId === t.artistId && t.phase === 'choosing' && room.state === 'DRAWING' ? t.choices : null,
      deltas: room.state === 'ROUND_RESULTS' ? t.deltas : null,
      reason: t.reason || null,
      guessedCount: t.guessed.size,
      round: m ? Math.floor(t.index / m.order.length) + 1 : 1
    };
  }
  return {
    code: room.code, state: room.state, hostId: room.hostId, you: viewerId, config: room.config,
    minPlayers: C.MIN_PLAYERS_TO_START, rewardMinPlayers: C.MIN_PLAYERS_FOR_REWARD, rewards: C.REWARDS,
    deadline: room.deadline, serverNow: now(), players, turn,
    match: m ? { rounds: m.rounds, turnsDone: m.turnsCompleted, totalTurns: m.rounds * m.order.length } : null,
    next: room.state === 'NEXT_ROUND' && room.next ? { round: room.next.round, artistId: room.next.artistId } : null,
    result: room.state === 'MATCH_FINISHED' ? room.result : null
  };
}
function broadcastState(room) {
  for (const p of room.players.values()) if (p.connected) sendTo(p.id, { type: 'state', state: snapshot(room, p.id) });
}
function emitChat(room, entry, onlyIds) {
  const e = { ...entry, t: now() };
  if (!onlyIds) { room.chat.push(e); if (room.chat.length > 60) room.chat.shift(); }
  for (const p of room.players.values()) {
    if (!p.connected) continue;
    if (!onlyIds || onlyIds.includes(p.id)) sendTo(p.id, { type: 'chat', msg: e });
  }
}
const sys = (room, text) => emitChat(room, { kind: 'system', text });

function resetRoomToWaiting(room) {
  for (const [id, p] of [...room.players]) {
    if (p.left || !p.connected) { room.players.delete(id); if (playerRoom.get(id) === room.code) playerRoom.delete(id); }
  }
  for (const p of room.players.values()) { p.score = 0; p.correct = 0; p.fast = 0; p.turnsPresent = 0; }
  room.state = 'WAITING'; room.match = null; room.turn = null; room.next = null; room.result = null; room.deadline = 0; room.lowSince = null;
  if (!room.players.has(room.hostId)) reassignHost(room);
}
function reassignHost(room) {
  const next = connectedPlayers(room).sort((a, b) => a.order - b.order)[0];
  if (next) { room.hostId = next.id; sys(room, `${next.name} is now the host.`); }
}
function removeFromRoom(room, id, { forfeit }) {
  const p = room.players.get(id);
  if (!p) return;
  if (playerRoom.get(id) === room.code) playerRoom.delete(id);
  if (forfeit) { p.left = true; p.connected = false; } else room.players.delete(id);
  sys(room, `${p.name} left.`);
  if (room.hostId === id) reassignHost(room);
  if (room.players.size === 0 || [...room.players.values()].every(x => x.left)) { rooms.delete(room.code); return; }
  broadcastState(room);
}

/* ────────────────────────────── match flow ────────────────────────────── */
function startMatch(room) {
  const ids = shuffle([...connectedPlayers(room)].map(p => p.id));
  for (const p of room.players.values()) { p.score = 0; p.correct = 0; p.fast = 0; p.turnsPresent = 0; }
  room.match = {
    id: crypto.randomUUID(), order: ids, participants: new Set(ids), pointer: 0,
    rounds: room.config.rounds, drawTime: room.config.drawTime,
    turnsCompleted: 0, turnsWithGuess: 0, used: new Set(), finalized: false, startedAt: now()
  };
  room.turn = null; room.result = null;
  room.state = 'STARTING'; room.deadline = now() + C.STARTING_TIME * 1000;
  sys(room, 'Match starting!');
  broadcastState(room);
}
function peek(room) {
  const m = room.match, n = m.order.length, total = m.rounds * n;
  for (let k = m.pointer; k < total; k++) {
    const p = room.players.get(m.order[k % n]);
    if (p && !p.left && p.connected) return k;
  }
  return -1;
}
function pickWords(m) {
  const pool = WORDS.filter(w => !m.used.has(w));
  if (pool.length < C.WORD_CHOICES) m.used.clear();
  return shuffle(WORDS.filter(w => !m.used.has(w))).slice(0, C.WORD_CHOICES);
}
function startTurn(room, k) {
  const m = room.match, n = m.order.length;
  m.pointer = k + 1;
  room.turn = {
    index: k, artistId: m.order[k % n], phase: 'choosing', phaseEndsAt: now() + C.CHOOSE_TIME * 1000,
    choices: pickWords(m), word: null, wordNorm: null, drawStart: 0, endsAt: 0,
    guessed: new Set(), deltas: {}, strokes: [], strokePts: 0, revealed: new Set(), hintSteps: 0, reason: null
  };
  for (const p of room.players.values()) if (!p.left && p.connected && m.participants.has(p.id)) p.turnsPresent++;
  room.state = 'DRAWING'; room.next = null;
  for (const p of room.players.values()) if (p.connected) sendTo(p.id, { type: 'replay', strokes: [] });
  broadcastState(room);
}
function chooseWord(room, index) {
  const t = room.turn, m = room.match;
  if (!t || t.phase !== 'choosing') return;
  const w = t.choices[index] !== undefined ? t.choices[index] : t.choices[0];
  t.word = w; t.wordNorm = norm(w); t.phase = 'drawing';
  t.drawStart = now(); t.endsAt = t.drawStart + m.drawTime * 1000;
  m.used.add(w);
  const artist = room.players.get(t.artistId);
  sys(room, `${artist ? artist.name : 'The artist'} is drawing now!`);
  broadcastState(room);
}
function scoreTurnArtist(room) { /* artist points are credited per correct guess (see handleGuess) */ }

function endTurn(room, reason) {
  const t = room.turn, m = room.match;
  if (room.state !== 'DRAWING' || !t) return;
  t.reason = reason;
  if (t.word) { m.turnsCompleted++; if (t.guessed.size) m.turnsWithGuess++; sys(room, `The word was "${t.word}".`); }
  room.state = 'ROUND_RESULTS'; room.deadline = now() + C.RESULTS_TIME * 1000;
  broadcastState(room);
}
function afterResults(room) {
  const k = peek(room);
  if (k < 0) return finishMatch(room);
  const m = room.match, n = m.order.length;
  room.next = { index: k, artistId: m.order[k % n], round: Math.floor(k / n) + 1 };
  room.state = 'NEXT_ROUND'; room.deadline = now() + C.NEXT_TIME * 1000;
  broadcastState(room);
}
function finishMatch(room, forceInvalid) {
  room.state = 'MATCH_FINISHED'; room.deadline = 0;
  finalizeMatch(room, forceInvalid);
  broadcastState(room);
  for (const p of room.players.values()) if (p.connected && db.players[p.id]) sendTo(p.id, { type: 'profile', profile: profileView(p.id) });
}

/* ────────────────────────────── rewards ────────────────────────────── */
function rankPlayers(room) {
  const m = room.match;
  const pool = [...room.players.values()].filter(p => m.participants.has(p.id) && !p.left);
  pool.sort((a, b) => b.score - a.score || b.correct - a.correct || a.order - b.order); // deterministic, no shared ranks
  const needed = Math.ceil(m.turnsCompleted * C.REWARD_MIN_TURN_SHARE);
  return pool.map((p, i) => ({ id: p.id, name: p.name, rank: i + 1, score: p.score, correct: p.correct, fast: p.fast, eligible: p.turnsPresent >= needed && m.turnsCompleted > 0 }));
}
function assess(room, ranked, forceInvalid) {
  const m = room.match, signals = [], withheld = new Set();
  if (forceInvalid) return { valid: false, reason: forceInvalid, withheld, signals, groupKey: '' };
  const eligible = ranked.filter(r => r.eligible);
  const groupKey = sha(eligible.map(r => r.id).sort().join(','));
  if (eligible.length < C.MIN_PLAYERS_FOR_REWARD) return { valid: false, reason: 'too_few_players', withheld, signals, groupKey };
  if (m.turnsCompleted < eligible.length) return { valid: false, reason: 'too_few_turns', withheld, signals, groupKey };
  if (m.turnsWithGuess < Math.ceil(m.turnsCompleted / 2)) return { valid: false, reason: 'too_few_correct_guesses', withheld, signals, groupKey };
  const dayAgo = now() - 24 * 3600 * 1000;
  const repeats = db.matches.filter(x => x.valid && x.at > dayAgo && x.groupKey === groupKey).length;
  if (repeats >= C.REPEAT_GROUP_LIMIT) { signals.push('repeat_group'); return { valid: false, reason: 'held_for_review', withheld, signals, groupKey }; }
  const hourAgo = now() - 3600 * 1000;
  for (const r of eligible) {
    const n = db.ledger.filter(l => l.playerId === r.id && l.type === 'match_reward' && l.at > hourAgo).length;
    if (n >= C.REWARD_LIMIT_PER_HOUR) { withheld.add(r.id); signals.push('hourly_cap:' + r.id); }
    if (r.correct >= 4 && r.fast / r.correct >= 0.8) signals.push('fast_guesses:' + r.id); // weak signal: flag only
  }
  return { valid: true, reason: null, withheld, signals, groupKey };
}
function finalizeMatch(room, forceInvalid) {
  const m = room.match;
  if (!m || m.finalized) return room.result;
  const ranked = rankPlayers(room);
  const v = assess(room, ranked, forceInvalid);
  const rows = ranked.map(r => ({
    id: r.id, name: r.name, hue: hue(r.id), rank: r.rank, score: r.score, eligible: r.eligible,
    coins: v.valid && r.eligible && !v.withheld.has(r.id) ? (C.REWARDS[r.rank] || 0) : 0
  }));
  try {
    tx(() => {
      if (db.matches.some(x => x.id === m.id)) return; // already recorded: never pay twice
      for (const r of rows) {
        if (r.coins > 0) {
          const key = `skribbl:${m.id}:${r.id}`;
          if (!credit(r.id, r.coins, 'match_reward', 'campus_doodle', m.id, key)) r.coins = 0;
        }
        if (v.valid && r.eligible) {
          const s = db.players[r.id].stats;
          s.matches++; s.totalScore += r.score; s.coinsEarned += r.coins; if (r.rank === 1) s.wins++;
        }
      }
      db.matches.push({
        id: m.id, at: now(), rulesVersion: C.RULES_VERSION, valid: v.valid, reason: v.reason, groupKey: v.groupKey,
        rounds: m.rounds, drawTime: m.drawTime, turns: m.turnsCompleted,
        players: rows.map(r => ({ id: r.id, name: r.name, rank: r.rank, score: r.score, coins: r.coins, eligible: r.eligible }))
      });
      if (db.matches.length > 20000) db.matches.splice(0, db.matches.length - 20000);
      if (v.signals.length || (!v.valid && v.reason === 'held_for_review')) {
        db.flags.push({ at: now(), matchId: m.id, reason: v.reason || 'signals', signals: v.signals, players: rows.map(r => r.id) });
      }
    });
    m.finalized = true;
    room.result = { matchId: m.id, valid: v.valid, reason: v.reason, rows };
  } catch (e) {
    console.error('finalize failed, will retry:', e.message);
    room.result = { matchId: m.id, valid: false, reason: 'processing', rows: rows.map(r => ({ ...r, coins: 0 })) };
    room.finalizeRetry = { at: now() + 3000, tries: (room.finalizeRetry ? room.finalizeRetry.tries : 0) + 1, forceInvalid };
  }
  return room.result;
}

/* ────────────────────────────── ticking ────────────────────────────── */
function tickRoom(room, t) {
  const m = room.match;
  // disconnect bookkeeping
  for (const p of room.players.values()) {
    if (!p.connected && !p.left && t - p.dcAt > C.RECONNECT_GRACE_MS) {
      if (room.state === 'WAITING' || room.state === 'MATCH_FINISHED') { room.players.delete(p.id); if (playerRoom.get(p.id) === room.code) playerRoom.delete(p.id); sys(room, `${p.name} timed out.`); broadcastState(room); }
      else { p.left = true; sys(room, `${p.name} left the match.`); broadcastState(room); }
    }
  }
  const host = room.players.get(room.hostId);
  if (!host || (!host.connected && t - host.dcAt > C.HOST_GRACE_MS) || host.left) { reassignHost(room); broadcastState(room); }

  if (room.finalizeRetry && room.state === 'MATCH_FINISHED' && t >= room.finalizeRetry.at) {
    const fr = room.finalizeRetry; room.finalizeRetry = null;
    if (fr.tries < 5) { finalizeMatch(room, fr.forceInvalid); if (room.match.finalized) { broadcastState(room); for (const p of room.players.values()) if (p.connected && db.players[p.id]) sendTo(p.id, { type: 'profile', profile: profileView(p.id) }); } }
  }

  const active = ['STARTING', 'DRAWING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(room.state);
  if (active) {
    if (connectedPlayers(room).length < C.MIN_PLAYERS_TO_START) {
      room.lowSince = room.lowSince || t;
      if (t - room.lowSince > C.ABANDON_MS) { sys(room, 'Not enough players. Match cancelled, no Coins awarded.'); return finishMatch(room, 'cancelled'); }
    } else room.lowSince = null;
  }

  switch (room.state) {
    case 'STARTING':
      if (t >= room.deadline) {
        if (connectedPlayers(room).length < C.MIN_PLAYERS_TO_START) { sys(room, 'Not enough players to start.'); resetRoomToWaiting(room); broadcastState(room); break; }
        const k = peek(room);
        if (k < 0) return finishMatch(room, 'cancelled');
        startTurn(room, k);
      }
      break;
    case 'DRAWING': {
      const tr = room.turn, artist = room.players.get(tr.artistId);
      if (!artist || artist.left || (!artist.connected && t - artist.dcAt > C.ARTIST_GRACE_MS)) { endTurn(room, 'artist_left'); break; }
      if (tr.phase === 'choosing') { if (t >= tr.phaseEndsAt) chooseWord(room, 0); break; }
      const elapsed = (t - tr.drawStart) / (m.drawTime * 1000);
      const letters = [...tr.word].map((c, i) => [c, i]).filter(([c]) => c !== ' ').map(([, i]) => i);
      const steps = letters.length >= 4 ? (elapsed >= 0.7 ? 2 : elapsed >= 0.45 ? 1 : 0) : 0;
      if (steps > tr.hintSteps) {
        tr.hintSteps = steps;
        const hidden = letters.filter(i => !tr.revealed.has(i));
        if (hidden.length > 1) tr.revealed.add(pick(hidden));
        broadcastState(room);
      }
      if (t >= tr.endsAt) endTurn(room, 'time');
      break;
    }
    case 'ROUND_RESULTS': if (t >= room.deadline) afterResults(room); break;
    case 'NEXT_ROUND':
      if (t >= room.deadline) {
        const k = peek(room);
        if (k < 0) finishMatch(room); else startTurn(room, k);
      }
      break;
    default:
  }
}
function everyoneGuessed(room) {
  const t = room.turn;
  const guessers = connectedPlayers(room).filter(p => p.id !== t.artistId);
  return guessers.length > 0 && guessers.every(p => t.guessed.has(p.id));
}
function sweep() {
  const t = now();
  for (const room of [...rooms.values()]) {
    try {
      const anyone = connectedPlayers(room).length > 0;
      if (anyone) room.emptySince = null; else room.emptySince = room.emptySince || t;
      if ((room.emptySince && t - room.emptySince > C.ROOM_IDLE_MS) || t - room.createdAt > C.ROOM_TTL_MS) {
        for (const p of room.players.values()) if (playerRoom.get(p.id) === room.code) playerRoom.delete(p.id);
        rooms.delete(room.code); continue;
      }
      tickRoom(room, t);
    } catch (e) { console.error('tick error', e); }
  }
}

/* ────────────────────────────── client actions ────────────────────────────── */
function roomOf(ctx) { const c = playerRoom.get(ctx.id); return c ? rooms.get(c) : null; }

function onHello(ctx, msg) {
  if (typeof msg.token !== 'string' || !/^[a-f0-9]{32,64}$/.test(msg.token)) return err(ctx, 'Invalid session.', 'bad_token');
  const id = sha(msg.token).slice(0, 24);
  const prior = sockets.get(id);
  if (prior && prior !== ctx.ws) { send(prior, { type: 'replaced' }); clients.get(prior) && (clients.get(prior).id = null); try { prior.close(); } catch (_) { /* ignore */ } }
  const wanted = cleanName(msg.name);
  const existing = db.players[id];
  const name = wanted || (existing && existing.name) || 'Player' + crypto.randomInt(1000, 9999);
  ctx.id = id;
  sockets.set(id, ctx.ws);
  const prof = ensureProfile(id, name);
  send(ctx.ws, { type: 'hello', profile: profileView(id), catalog: C.ITEMS.filter(i => i.active).map(publicItem), config: { rounds: C.ROUNDS, drawTime: C.DRAW_TIME, rewards: C.REWARDS, maxPlayers: C.MAX_PLAYERS, minPlayers: C.MIN_PLAYERS_TO_START, rewardMinPlayers: C.MIN_PLAYERS_FOR_REWARD } });
  const room = roomOf(ctx);
  if (room && room.players.has(id)) {
    const p = room.players.get(id);
    if (p.left) { playerRoom.delete(id); return; }
    p.connected = true; p.dcAt = 0;
    if (wanted && room.state === 'WAITING') p.name = prof.name;
    send(ctx.ws, { type: 'chatlog', msgs: room.chat });
    if (room.turn && room.state !== 'WAITING') send(ctx.ws, { type: 'replay', strokes: room.turn.strokes });
    sys(room, `${p.name} reconnected.`);
    broadcastState(room);
  }
}
function onCreate(ctx, msg) {
  if (roomOf(ctx)) return err(ctx, 'Leave your current room first.');
  const log = (createLog.get(ctx.id) || []).filter(t => now() - t < C.ROOM_CREATE_LIMIT.windowMs);
  if (log.length >= C.ROOM_CREATE_LIMIT.count) return err(ctx, 'You are creating rooms too quickly. Try again in a few minutes.', 'rate');
  log.push(now()); createLog.set(ctx.id, log);
  const room = { code: genCode(), hostId: ctx.id, state: 'WAITING', deadline: 0, config: cleanConfig(msg.config), players: new Map(), match: null, turn: null, next: null, result: null, chat: [], createdAt: now(), emptySince: null, lowSince: null, finalizeRetry: null };
  rooms.set(room.code, room);
  addPlayer(room, ctx.id, db.players[ctx.id].name);
  send(ctx.ws, { type: 'chatlog', msgs: [] });
  sys(room, 'Room created. Share the code to invite friends.');
  broadcastState(room);
}
function onJoin(ctx, msg) {
  if (roomOf(ctx)) return err(ctx, 'Leave your current room first.');
  const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{5}$/.test(code)) return err(ctx, 'Room codes have 5 letters or numbers.', 'bad_code');
  const room = rooms.get(code);
  if (!room) return err(ctx, 'No room with that code.', 'no_room');
  if (room.state !== 'WAITING') return err(ctx, 'That match has already started.', 'started');
  if (room.players.size >= C.MAX_PLAYERS) return err(ctx, 'That room is full.', 'full');
  const p = addPlayer(room, ctx.id, db.players[ctx.id].name);
  send(ctx.ws, { type: 'chatlog', msgs: room.chat });
  sys(room, `${p.name} joined.`);
  broadcastState(room);
}
function onLeave(ctx) {
  const room = roomOf(ctx);
  if (!room) return;
  const inMatch = ['STARTING', 'DRAWING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(room.state);
  removeFromRoom(room, ctx.id, { forfeit: inMatch });
  send(ctx.ws, { type: 'left' });
}
function onConfig(ctx, msg) {
  const room = roomOf(ctx);
  if (!room || room.hostId !== ctx.id || room.state !== 'WAITING') return err(ctx, 'Only the host can change settings before the match starts.');
  room.config = cleanConfig({ ...room.config, ...msg.config });
  broadcastState(room);
}
function onStart(ctx) {
  const room = roomOf(ctx);
  if (!room || room.hostId !== ctx.id) return err(ctx, 'Only the host can start the match.');
  if (room.state !== 'WAITING') return; // duplicate click: ignored
  if (connectedPlayers(room).length < C.MIN_PLAYERS_TO_START) return err(ctx, `Need at least ${C.MIN_PLAYERS_TO_START} connected players.`, 'min_players');
  startMatch(room);
}
function onRematch(ctx) {
  const room = roomOf(ctx);
  if (!room || room.hostId !== ctx.id || room.state !== 'MATCH_FINISHED') return;
  resetRoomToWaiting(room); broadcastState(room);
}
function onChoose(ctx, msg) {
  const room = roomOf(ctx);
  if (!room || room.state !== 'DRAWING' || room.turn.artistId !== ctx.id || room.turn.phase !== 'choosing') return;
  chooseWord(room, clampInt(msg.index, 0, C.WORD_CHOICES - 1, 0));
}
const PALETTE_SIZE = 16, SIZE_COUNT = 6;
function onDraw(ctx, msg) {
  const room = roomOf(ctx);
  if (!room || room.state !== 'DRAWING') return;
  const t = room.turn;
  if (t.phase !== 'drawing' || t.artistId !== ctx.id) { ctx.violations++; return; } // only the artist may draw
  if (msg.op === 'clear') { t.strokes = []; t.strokePts = 0; for (const p of room.players.values()) if (p.connected && p.id !== ctx.id) sendTo(p.id, { type: 'clear' }); return; }
  if (msg.op !== 'line' || !Array.isArray(msg.pts) || msg.pts.length < 1 || msg.pts.length > 32) return;
  const c = msg.c, s = msg.s;
  if (!Number.isInteger(c) || c < 0 || c >= PALETTE_SIZE || !Number.isInteger(s) || s < 0 || s >= SIZE_COUNT) return;
  const pts = [];
  for (const pt of msg.pts) {
    if (!Array.isArray(pt) || pt.length !== 2) return;
    const x = pt[0], y = pt[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
    pts.push([Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
  }
  if (t.strokes.length >= 4000 || t.strokePts + pts.length > 60000) return;
  const stroke = { pts, c, s, e: msg.e === true };
  t.strokes.push(stroke); t.strokePts += pts.length;
  for (const p of room.players.values()) if (p.connected && p.id !== ctx.id) sendTo(p.id, { type: 'draw', stroke });
}
function onGuess(ctx, msg) {
  const room = roomOf(ctx);
  if (!room) return;
  const text = cleanText(msg.text, 60);
  if (!text) return;
  ctx.guessTimes = (ctx.guessTimes || []).filter(x => now() - x < 3000);
  if (ctx.guessTimes.length >= 5) return err(ctx, 'Slow down a little.', 'rate');
  ctx.guessTimes.push(now());
  const p = room.players.get(ctx.id);
  const t = room.turn;
  const live = room.state === 'DRAWING' && t && t.phase === 'drawing';
  if (!live) return emitChat(room, { kind: 'chat', name: p.name, text });
  if (ctx.id === t.artistId || t.guessed.has(ctx.id)) {
    const team = [t.artistId, ...t.guessed];
    return emitChat(room, { kind: 'team', name: p.name, text }, team); // never visible to players still guessing
  }
  const g = norm(text);
  if (!g) return;
  if (g === t.wordNorm) {
    const tms = now();
    const remaining = Math.max(0, t.endsAt - tms);
    const pts = Math.round(100 + 400 * remaining / (room.match.drawTime * 1000));
    p.score += pts; p.correct++; if (tms - t.drawStart < 1200) p.fast++;
    t.deltas[p.id] = (t.deltas[p.id] || 0) + pts;
    const artist = room.players.get(t.artistId);
    if (artist) { const ap = Math.round(pts * 0.35); artist.score += ap; t.deltas[artist.id] = (t.deltas[artist.id] || 0) + ap; }
    t.guessed.add(p.id);
    emitChat(room, { kind: 'correct', name: p.name, text: 'guessed the word!' });
    broadcastState(room);
    if (everyoneGuessed(room)) endTurn(room, 'all_guessed');
    return;
  }
  if (t.wordNorm.length >= 3 && g.includes(t.wordNorm)) return sendTo(ctx.id, { type: 'chat', msg: { kind: 'hint', text: 'Send just the word, not a sentence.', t: now() } });
  if (t.wordNorm.length >= 5 && lev(g, t.wordNorm) === 1) sendTo(ctx.id, { type: 'chat', msg: { kind: 'hint', text: `"${text}" is close!`, t: now() } });
  emitChat(room, { kind: 'guess', name: p.name, text });
}

/* ────────────────────────────── shop ────────────────────────────── */
function shopView(id) {
  const p = db.players[id];
  return { coins: p.coins, items: C.ITEMS.filter(i => i.active).map(i => ({ ...publicItem(i), owned: p.inventory[i.id] || 0, equipped: p.equipped[i.type] === i.id })) };
}
function buy(id, itemId, qty, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return { ok: false, message: 'Invalid request.' };
  const rkey = id + ':' + key;
  if (db.redemptions[rkey]) return { ok: true, repeated: true, ...db.redemptions[rkey].response };
  const item = ITEMS.get(itemId);
  if (!item || !item.active) return { ok: false, message: 'That item is not available.' };
  qty = Number(qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > item.maxOwned) return { ok: false, message: 'Invalid quantity.' };
  try {
    return tx(() => {
      const p = db.players[id];
      if ((p.inventory[item.id] || 0) + qty > item.maxOwned) return { ok: false, message: 'You already own this item.' };
      const total = item.price * qty;
      if (p.coins < total) return { ok: false, message: `You need ${total - p.coins} more Coins.` };
      p.coins -= total;
      p.inventory[item.id] = (p.inventory[item.id] || 0) + qty;
      db.ledger.push({ id: crypto.randomUUID(), playerId: id, amount: -total, type: 'shop_purchase', source: 'campus_doodle', matchId: null, key: rkey, balanceAfter: p.coins, at: now() });
      const response = { itemId: item.id, coinsSpent: total, balance: p.coins };
      db.redemptions[rkey] = { itemId: item.id, qty, coinsSpent: total, status: 'completed', at: now(), response };
      return { ok: true, ...response };
    });
  } catch (e) { console.error('purchase failed', e.message); return { ok: false, message: 'Purchase failed. You were not charged.' }; }
}
function equip(id, itemId, slot) {
  const p = db.players[id];
  if (itemId === null) {
    if (!['frame', 'badge', 'title', 'theme'].includes(slot)) return false;
    delete p.equipped[slot]; return true;
  }
  const item = ITEMS.get(itemId);
  if (!item || !(p.inventory[item.id] > 0)) return false;
  p.equipped[item.type] = item.id; return true;
}

/* ────────────────────────────── leaderboard / history ────────────────────────────── */
function leaderboard(view, page, viewerId) {
  const since = view === 'weekly' ? now() - 7 * 86400000 : view === 'monthly' ? now() - 30 * 86400000 : 0;
  const agg = new Map();
  for (const m of db.matches) {
    if (!m.valid || m.at < since) continue;
    for (const r of m.players) {
      if (!r.eligible) continue;
      const a = agg.get(r.id) || { id: r.id, coins: 0, wins: 0, matches: 0, score: 0 };
      a.coins += r.coins; a.matches++; a.score += r.score; if (r.rank === 1) a.wins++;
      agg.set(r.id, a);
    }
  }
  const nameOf = id => (db.players[id] ? db.players[id].name : 'Player');
  const cmp = {
    wins: (a, b) => b.wins - a.wins || b.coins - a.coins || a.matches - b.matches,
    score: (a, b) => b.score - a.score || b.coins - a.coins || a.matches - b.matches
  }[view] || ((a, b) => b.coins - a.coins || b.wins - a.wins || a.matches - b.matches);
  const rows = [...agg.values()].sort((a, b) => cmp(a, b) || nameOf(a.id).localeCompare(nameOf(b.id)));
  const size = 20, pages = Math.max(1, Math.ceil(rows.length / size));
  page = clampInt(page, 1, pages, 1);
  const shape = (a, i) => ({ rank: i + 1, name: nameOf(a.id), hue: hue(a.id), coins: a.coins, wins: a.wins, matches: a.matches, score: a.score, me: a.id === viewerId });
  const mineIdx = rows.findIndex(a => a.id === viewerId);
  return { view, page, pages, total: rows.length, rows: rows.slice((page - 1) * size, page * size).map((a, i) => shape(a, (page - 1) * size + i)), mine: mineIdx >= 0 ? shape(rows[mineIdx], mineIdx) : null };
}
function history(id) {
  const out = [];
  for (let i = db.matches.length - 1; i >= 0 && out.length < 20; i--) {
    const m = db.matches[i], me = m.players.find(r => r.id === id);
    if (!me) continue;
    out.push({ at: m.at, valid: m.valid, reason: m.reason, rank: me.rank, score: me.score, coins: me.coins, players: m.players.length, rounds: m.rounds, top: m.players.slice(0, 3).map(r => ({ rank: r.rank, name: db.players[r.id] ? db.players[r.id].name : r.name, score: r.score })) });
  }
  return out;
}

/* ────────────────────────────── transport ────────────────────────────── */
const PUBLIC = path.join(__dirname, 'public');
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const PRACTICE_BODY_LIMIT = 1024 * 1024;
const PRACTICE_IMAGE_LIMIT = 700 * 1024;

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

async function requestBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > PRACTICE_BODY_LIMIT) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }
  try { return JSON.parse(body); } catch (_) { throw Object.assign(new Error('Invalid JSON body.'), { status: 400 }); }
}

function imageData(value) {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const encoded = value.slice('data:image/png;base64,'.length);
  if (encoded.length > Math.ceil(PRACTICE_IMAGE_LIMIT * 4 / 3)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || bytes.length > PRACTICE_IMAGE_LIMIT || !bytes.subarray(0, 8).equals(signature)
    || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  return width > 0 && width <= 2048 && height > 0 && height <= 2048 ? value : null;
}

function practiceWord(value, choices) {
  if (typeof value !== 'string') return null;
  const normal = value.trim().toLocaleLowerCase('en-US');
  return choices.find(word => word.toLocaleLowerCase('en-US') === normal) || null;
}

function validStrokes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return false;
  return value.every(stroke => stroke && Number.isInteger(stroke.c) && stroke.c >= 0 && stroke.c < 16
    && Number.isInteger(stroke.s) && stroke.s >= 0 && stroke.s < 6
    && typeof stroke.e === 'boolean'
    && Array.isArray(stroke.pts) && stroke.pts.length >= 1 && stroke.pts.length <= 40
    && stroke.pts.every(point => Array.isArray(point) && point.length === 2
      && point.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)));
}

function ollamaConfig() {
  const baseUrl = new URL(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw Object.assign(new Error('OLLAMA_BASE_URL must be an HTTP(S) URL without credentials or query parameters.'), { status: 500 });
  }
  return { baseUrl, model: process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:3b' };
}

async function ollamaRequest(endpoint, options) {
  const { baseUrl } = ollamaConfig();
  let response;
  try {
    response = await fetch(new URL(endpoint, baseUrl), {
      ...options,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    console.error('Ollama practice request failed:', error.message);
    throw Object.assign(new Error('Cannot connect to local Ollama. Start Ollama and make sure the vision model is installed.'), { status: 503 });
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error || ''; } catch (_) { /* Ollama may return non-JSON errors. */ }
    console.error('Ollama practice request returned HTTP', response.status, detail);
    if (response.status === 404) {
      throw Object.assign(new Error('The Ollama vision model was not found. Run `ollama pull qwen2.5vl:3b` or set OLLAMA_VISION_MODEL to a model you have installed.'), { status: 503 });
    }
    throw Object.assign(new Error('Local Ollama could not complete this turn. Check that Ollama is running and try again.'), { status: 502 });
  }
  try {
    return await response.json();
  } catch (_) {
    throw Object.assign(new Error('Ollama returned an unreadable response.'), { status: 502 });
  }
}

async function ollamaStatus() {
  const { model } = ollamaConfig();
  try {
    const data = await ollamaRequest('/api/tags');
    const installed = Array.isArray(data.models) && data.models.some(entry => entry.name === model || entry.model === model);
    return installed
      ? { available: true, provider: 'ollama', model }
      : { available: false, provider: 'ollama', model, message: `Ollama is running, but ${model} is not installed. Open PowerShell and run: ollama pull ${model}` };
  } catch (error) {
    if (!error.status) throw error;
    return { available: false, provider: 'ollama', model, message: error.message };
  }
}

async function ollamaPractice(prompt, image, choices) {
  const { model } = ollamaConfig();
  const userMessage = { role: 'user', content: prompt };
  if (image) userMessage.images = [image.slice(image.indexOf(',') + 1)];
  const data = await ollamaRequest('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return only a valid JSON object matching the requested fields. Follow the user prompt exactly.' },
        userMessage
      ],
      format: 'json',
      stream: false,
      options: { temperature: 0.2, num_predict: image ? 100 : 1600 }
    })
  });
  const content = data && data.message && data.message.content;
  try {
    const parsed = JSON.parse(content);
    if (image) {
      if (typeof parsed.word !== 'string' || !parsed.word.trim() || parsed.word.trim().length > 40) throw new Error('Invalid practice guess.');
      return { word: parsed.word.trim() };
    }
    const word = practiceWord(parsed.word, choices);
    if (!word || !validStrokes(parsed.strokes)) throw new Error('Invalid practice drawing.');
    return { word, strokes: parsed.strokes };
  } catch (_) {
    throw Object.assign(new Error('Ollama returned an invalid answer. Try again or use another vision model.'), { status: 502 });
  }
}

function start(port = C.PORT) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(value => {
      try {
        const origin = new URL(value);
        return origin.origin === value && ['http:', 'https:'].includes(origin.protocol) ? origin.origin : null;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
  const frameAncestors = ["'self'", ...allowed].join(' ');
  const practiceLimits = new Map();
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const headers = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors ${frameAncestors}`
    };
    if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (url === '/api/words' && req.method === 'GET') return json(res, 200, { words: WORDS });
    if (url === '/api/ai/status' && req.method === 'GET') {
      ollamaStatus().then(status => json(res, 200, status)).catch(error => {
        console.error('Could not check Ollama status:', error);
        json(res, 500, { available: false, provider: 'ollama', message: error.message });
      });
      return;
    }
    if (url === '/api/ai/draw' || url === '/api/ai/guess') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      const origin = req.headers.origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          if (parsed.host !== req.headers.host && !allowed.includes(parsed.origin)) return json(res, 403, { error: 'Origin not allowed.' });
        } catch (_) { return json(res, 403, { error: 'Origin not allowed.' }); }
      }
      const ip = req.socket.remoteAddress || '?';
      let limit = practiceLimits.get(ip);
      if (!limit || limit.resetAt <= Date.now()) {
        limit = { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
        practiceLimits.set(ip, limit);
      }
      if (limit.count >= 30) return json(res, 429, { error: 'Practice AI is busy. Please try again later.' });
      limit.count++;
      requestBody(req).then(async body => {
        const isDraw = url.endsWith('/draw');
        const choices = body && body.choices;
        if (isDraw && (!Array.isArray(choices) || choices.length !== 3
          || choices.some(word => typeof word !== 'string' || word.length > 40 || !WORDS.includes(word))
          || new Set(choices).size !== 3)) return json(res, 400, { error: 'Choose three different words from the practice word bank.' });
        const image = isDraw ? null : imageData(body && body.image);
        if (!isDraw && !image) return json(res, 400, { error: 'A valid PNG drawing is required.' });
        const prompt = isDraw
          ? `Choose exactly one of these easy-to-draw words: ${JSON.stringify(choices)}. Create a clear, simple drawing using 1 to 24 strokes. Each stroke has c (colour index 0-15), s (brush size index 0-5), e (boolean eraser), and pts (1-30 [x,y] coordinate pairs normalized from 0 to 1). Return JSON only: {"word":"exact choice","strokes":[{"c":0,"s":2,"e":false,"pts":[[0.2,0.3],[0.4,0.5]]}]}. Avoid letters, words, and numbers in the drawing.`
          : 'Look at the drawing and guess what it depicts. Do not ask for or use a list of choices. Return one short word or simple phrase as your best guess in JSON only: {"word":"your guess"}.';
        const result = await ollamaPractice(prompt, image, isDraw ? choices : null);
        json(res, 200, result);
      }).catch(error => {
        if (!error.status) console.error('Unexpected AI practice error:', error);
        json(res, error.status || 500, { error: error.status ? error.message : 'AI practice failed unexpectedly.' });
      });
      return;
    }
    const f = FILES[url];
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    fs.readFile(path.join(PUBLIC, f), (e, buf) => {
      if (e) { res.writeHead(500); return res.end('Error'); }
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(f)], 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
  const wss = new WebSocketServer({
    server, maxPayload: 8 * 1024,
    verifyClient: ({ origin, req }) => {
      if (!origin) return true;
      try { const parsed = new URL(origin); return parsed.host === req.headers.host || allowed.includes(parsed.origin); } catch (_) { return false; }
    }
  });
  const perIp = new Map();
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || '?';
    if ((perIp.get(ip) || 0) >= 60) return ws.close();
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const ctx = { ws, id: null, general: bucket(30, 15), draw: bucket(80, 50), guessTimes: [], violations: 0 };
    clients.set(ws, ctx); ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let msg; try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!msg || typeof msg.type !== 'string') return;
      try { route(ctx, msg); } catch (e) { console.error('handler error', e); err(ctx, 'Something went wrong.'); }
      if (ctx.violations > 300) ws.close();
    });
    ws.on('close', () => {
      perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
      clients.delete(ws);
      if (ctx.id && sockets.get(ctx.id) === ws) {
        sockets.delete(ctx.id);
        const room = roomOf(ctx);
        const p = room && room.players.get(ctx.id);
        if (p && !p.left) { p.connected = false; p.dcAt = now(); sys(room, `${p.name} disconnected.`); broadcastState(room); }
      }
    });
    ws.on('error', () => {});
  });
  const hb = setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (_) { /* ignore */ } } }, 25000);
  const ticker = setInterval(sweep, 250);
  server.on('close', () => { clearInterval(hb); clearInterval(ticker); wss.close(); });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

function route(ctx, msg) {
  if (msg.type === 'hello') return onHello(ctx, msg);
  if (!ctx.id) return err(ctx, 'Not signed in.', 'unauth');
  if (msg.type === 'draw') { if (!take(ctx.draw)) { ctx.violations++; return; } return onDraw(ctx, msg); }
  if (!take(ctx.general)) { ctx.violations++; return; }
  switch (msg.type) {
    case 'create_room': return onCreate(ctx, msg);
    case 'join_room': return onJoin(ctx, msg);
    case 'leave_room': return onLeave(ctx);
    case 'update_config': return onConfig(ctx, msg);
    case 'start_match': return onStart(ctx);
    case 'rematch': return onRematch(ctx);
    case 'choose_word': return onChoose(ctx, msg);
    case 'guess': return onGuess(ctx, msg);
    case 'shop_list': return send(ctx.ws, { type: 'shop', ...shopView(ctx.id) });
    case 'buy': {
      const r = buy(ctx.id, msg.itemId, msg.qty === undefined ? 1 : msg.qty, msg.key);
      send(ctx.ws, { type: 'buy_result', itemId: msg.itemId, ...r });
      send(ctx.ws, { type: 'profile', profile: profileView(ctx.id) });
      return send(ctx.ws, { type: 'shop', ...shopView(ctx.id) });
    }
    case 'equip': {
      const ok = equip(ctx.id, msg.itemId === null ? null : String(msg.itemId), String(msg.slot || ''));
      if (ok) { try { saveDb(); } catch (e) { console.error(e.message); } } else err(ctx, 'You do not own that item.');
      send(ctx.ws, { type: 'profile', profile: profileView(ctx.id) });
      send(ctx.ws, { type: 'shop', ...shopView(ctx.id) });
      const room = roomOf(ctx); if (room) broadcastState(room);
      return;
    }
    case 'leaderboard': return send(ctx.ws, { type: 'leaderboard', ...leaderboard(String(msg.view), msg.page, ctx.id) });
    case 'history': return send(ctx.ws, { type: 'history', matches: history(ctx.id) });
    default:
  }
}

if (require.main === module) {
  start().then(s => console.log(`Campus Doodle running on http://localhost:${s.address().port}`));
}

module.exports = {
  start,
  _test: {
    rooms, get db() { return db; }, finalizeMatch, buy, snapshot, tx,
    setFailSave(v) { failSave = v; }
  }
};
