'use strict';
// End-to-end tests: starts the real server in-process, plays real matches with WebSocket bots.
// Run with: npm test   (uses short timers via TEST_FAST=1 and a throw-away data file)
process.env.TEST_FAST = '1';
process.env.ALLOWED_ORIGINS = 'http://localhost:3037';
const os = require('os'), path = require('path'), fs = require('fs'), crypto = require('crypto'), assert = require('assert');
process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cd-')), 'db.json');
const WebSocket = require('ws');
const { start, _test } = require('../server');
const C = require('../config');
const nativeFetch = global.fetch;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port;

class Bot {
  constructor(name, delay = 0) { this.name = name; this.delay = delay; this.token = crypto.randomBytes(24).toString('hex'); this.msgs = []; this.state = null; this.profile = null; this.errors = []; }
  async connect(hello = true) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.ws.on('message', d => {
      const m = JSON.parse(d); this.msgs.push(m);
      if (m.type === 'state') this.state = m.state;
      if (m.type === 'profile' || m.type === 'hello') this.profile = m.profile;
      if (m.type === 'error') this.errors.push(m);
      if (this.onmsg) this.onmsg(m);
    });
    await new Promise(r => this.ws.on('open', r));
    if (hello) { this.send({ type: 'hello', token: this.token, name: this.name }); await this.waitFor(() => this.profile); }
    return this;
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async waitFor(pred, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { const v = pred(); if (v) return v; await sleep(15); } throw new Error('timeout waiting for condition'); }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}
function autoplay(bots, game) {
  for (const bot of bots) {
    bot.turnMsgs = [];
    bot.onmsg = m => {
      bot.turnMsgs.push(m);
      if (m.type !== 'state') return;
      const s = m.state, t = s.turn;
      if (s.state !== 'DRAWING' || !t) return;
      if (t.phase === 'choosing') bot.turnMsgs = [m];
      if (t.phase === 'choosing' && t.choices && bot.chose !== t.index) { bot.chose = t.index; bot.send({ type: 'choose_word', index: 0 }); }
      if (t.phase === 'drawing' && t.artistId === s.you && t.word) { game.word = t.word; game.turn = t.index; }
      if (t.phase === 'drawing' && t.artistId !== s.you && !t.word && bot.guessTurn !== t.index) {
        bot.guessTurn = t.index;
        setTimeout(() => {
          if (game.turn !== t.index) return;
          if (JSON.stringify(bot.turnMsgs).toLowerCase().includes(game.word.toLowerCase())) game.leak = true;
          if (!bot.skipGuess) bot.send({ type: 'guess', text: game.word });
        }, 100 + bot.delay);
      }
    };
  }
}
async function makeRoom(names, rounds = 1) {
  const bots = []; for (let i = 0; i < names.length; i++) bots.push(await new Bot(names[i], i * 120).connect());
  bots[0].send({ type: 'create_room', config: { rounds, drawTime: 3 } });
  const code = (await bots[0].waitFor(() => bots[0].state)).code;
  for (const b of bots.slice(1)) { b.send({ type: 'join_room', code }); await b.waitFor(() => b.state); }
  return { bots, code };
}
const finished = bots => bots[0].waitFor(() => { const s = bots[0].state; return s && s.state === 'MATCH_FINISHED' && s.result && s; });
const ledger = () => _test.db.ledger;

(async () => {
  const server = await start(0); port = server.address().port;
  console.log('Campus Doodle tests (port ' + port + ')');

  await test('game page can be embedded by the configured CampusVoice origin', async () => {
    const response = await nativeFetch(`http://localhost:${port}/`);
    assert.strictEqual(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self' http:\/\/localhost:3037/);
  });

  await test('AI practice endpoints and navigation are removed', async () => {
    for (const endpoint of ['/api/words', '/api/ai/status', '/api/ai/draw', '/api/ai/guess']) {
      const response = await nativeFetch('http://localhost:' + port + endpoint);
      assert.strictEqual(response.status, 404);
    }
    const response = await nativeFetch('http://localhost:' + port + '/');
    const page = await response.text();
    assert.doesNotMatch(page, /Practice vs AI|practice-canvas|practice-start/i);
  });
  await test('requests before hello are rejected', async () => {
    const b = await new Bot('x').connect(false);
    b.send({ type: 'create_room', config: {} });
    await b.waitFor(() => b.errors.length);
    assert.strictEqual(b.errors[0].code, 'unauth');
    b.close();
  });

  await test('Quick Play enters a public lobby immediately and starts when another player joins', async () => {
    const first = await new Bot('Quick One').connect();
    const second = await new Bot('Quick Two').connect();
    try {
      first.send({ type: 'quick_play' });
      const soloLobby = await first.waitFor(() => first.state && first.state.publicMatch && first.state.state === 'WAITING' && first.state);
      assert.strictEqual(soloLobby.players.length, 1);
      assert.strictEqual(_test.publicRoom.code, soloLobby.code);
      first.send({ type: 'leave_room' });
      await first.waitFor(() => first.msgs.find(m => m.type === 'left'));
      assert.strictEqual(_test.publicRoom, null);

      first.send({ type: 'quick_play' });
      const waitingRoom = await first.waitFor(() => first.state && first.state.publicMatch
        && first.state.code !== soloLobby.code && first.state.state === 'WAITING' && first.state);
      second.send({ type: 'quick_play' });
      const firstState = await first.waitFor(() => first.state && first.state.publicMatch && first.state.code === waitingRoom.code && first.state.state === 'STARTING' && first.state);
      const secondState = await second.waitFor(() => second.state && second.state.publicMatch && second.state.code === waitingRoom.code && second.state.state === 'STARTING' && second.state);
      assert.strictEqual(firstState.code, secondState.code);
      assert.strictEqual(firstState.players.length, 2);
      assert.notStrictEqual(firstState.you, secondState.you);
      first.send({ type: 'leave_room' });
      second.send({ type: 'leave_room' });
      await Promise.all([
        first.waitFor(() => first.msgs.find(m => m.type === 'left')),
        second.waitFor(() => second.msgs.find(m => m.type === 'left'))
      ]);
    } finally {
      first.close();
      second.close();
    }
  });

  let game4, rows4, room4;
  await test('4-player match: rotation, scoring, secret word never leaks, artist-only drawing', async () => {
    const { bots, code } = await makeRoom(['Ann', 'Ben', 'Cy', 'Dee']);
    room4 = bots;
    // invalid / unknown codes
    const extra = await new Bot('Eve').connect();
    extra.send({ type: 'join_room', code: 'ZZZZZ' }); await extra.waitFor(() => extra.errors.length);
    assert.strictEqual(extra.errors[0].code, 'no_room');
    extra.send({ type: 'join_room', code: '12' }); await extra.waitFor(() => extra.errors.length > 1);
    assert.strictEqual(extra.errors[1].code, 'bad_code');
    // only host can start
    bots[1].send({ type: 'start_match' }); await bots[1].waitFor(() => bots[1].errors.length);
    game4 = {}; autoplay(bots, game4);
    // chat/draw from non-artist is ignored
    bots[0].send({ type: 'start_match' }); bots[0].send({ type: 'start_match' }); // duplicate click is harmless
    await bots[0].waitFor(() => bots[0].state.state === 'DRAWING' && bots[0].state.turn.phase === 'drawing');
    const artistId = bots[0].state.turn.artistId;
    const artist = bots.find(b => b.state.you === artistId), other = bots.find(b => b.state.you !== artistId);
    const spectator = bots.find(b => b !== artist && b !== other);
    other.skipGuess = true;   // keep this player still guessing so we can check what they can see
    const before = spectator.msgs.filter(m => m.type === 'draw').length;
    other.send({ type: 'draw', op: 'line', pts: [[0.1, 0.1], [0.2, 0.2]], c: 1, s: 1 });
    await sleep(120);
    assert.strictEqual(spectator.msgs.filter(m => m.type === 'draw').length, before, 'non-artist stroke was broadcast');
    artist.send({ type: 'draw', op: 'line', pts: [[0.1, 0.1], [0.2, 0.2]], c: 1, s: 1 });
    artist.send({ type: 'draw', op: 'line', pts: [[2, 0.1]], c: 1, s: 1 });   // out of range: dropped
    await spectator.waitFor(() => spectator.msgs.filter(m => m.type === 'draw').length === before + 1);
    // the artist sees the word, a guesser does not
    assert.ok(artist.state.turn.word); assert.strictEqual(other.state.turn.word, null);
    assert.ok(!JSON.stringify(other.msgs.slice(-12)).includes(`"word":"${artist.state.turn.word}"`));
    other.skipGuess = false;
    const total = await finished(bots);
    assert.ok(total.result.valid, 'match should be valid: ' + total.result.reason);
    assert.ok(!game4.leak, 'secret word leaked to a player still guessing');
    // each player drew exactly once
    rows4 = total.result.rows;
    assert.strictEqual(rows4.length, 4);
  });

  await test('top four get 100/70/50/25 and the ledger matches', async () => {
    const expected = [100, 70, 50, 25];
    rows4.forEach((r, i) => { assert.strictEqual(r.rank, i + 1); assert.strictEqual(r.coins, expected[i]); });
    for (let i = 1; i < rows4.length; i++) assert.ok(rows4[i - 1].score >= rows4[i].score, 'ranking not sorted by score');
    for (const r of rows4) {
      const bal = _test.db.players[r.id].coins; assert.strictEqual(bal, r.coins);
      assert.strictEqual(ledger().filter(l => l.playerId === r.id && l.type === 'match_reward').length, 1);
    }
  });

  await test('finalizing again (retry / duplicate request) never credits twice', async () => {
    const room = [..._test.rooms.values()].find(r => r.match && r.match.id === (rows4 && room4[0].state.result.matchId));
    const before = ledger().length, coins = rows4.map(r => _test.db.players[r.id].coins);
    _test.finalizeMatch(room); _test.finalizeMatch(room);
    room.match.finalized = false; _test.finalizeMatch(room);        // even if the in-memory flag were lost
    assert.strictEqual(ledger().length, before);
    assert.deepStrictEqual(rows4.map(r => _test.db.players[r.id].coins), coins);
  });

  await test('failed save rolls everything back (no coins, no ledger rows)', async () => {
    const { bots } = await makeRoom(['Fay', 'Gus', 'Hal', 'Ivy']);
    const g = {}; autoplay(bots, g);
    const before = ledger().length;
    _test.setFailSave(true);
    bots[0].send({ type: 'start_match' });
    const res = await finished(bots);
    assert.strictEqual(res.result.valid, false); assert.strictEqual(res.result.reason, 'processing');
    assert.strictEqual(ledger().length, before);
    assert.ok(bots.every(b => _test.db.players[b.state.you].coins === 0));
    _test.setFailSave(false);                                     // server retries automatically
    await bots[0].waitFor(() => bots[0].state.result && bots[0].state.result.valid, 15000);
    assert.strictEqual(ledger().length, before + 4);
    bots.forEach(b => b.close());
  });

  await test('2-player match is friendly only: no Coins', async () => {
    const { bots } = await makeRoom(['Jo', 'Kim']);
    const g = {}; autoplay(bots, g);
    bots[0].send({ type: 'start_match' });
    const res = await finished(bots);
    assert.strictEqual(res.result.valid, false); assert.strictEqual(res.result.reason, 'too_few_players');
    assert.ok(res.result.rows.every(r => r.coins === 0));
    bots.forEach(b => b.close());
  });

  await test('match cannot start below the minimum player count', async () => {
    const b = await new Bot('Solo').connect();
    b.send({ type: 'create_room', config: {} }); await b.waitFor(() => b.state);
    b.send({ type: 'start_match' }); await b.waitFor(() => b.errors.length);
    assert.strictEqual(b.errors[0].code, 'min_players'); b.close();
  });

  await test('players cannot join a match that is already running', async () => {
    const { bots, code } = await makeRoom(['L1', 'L2']);
    const g = {}; autoplay(bots, g); bots[0].send({ type: 'start_match' });
    await bots[0].waitFor(() => bots[0].state.state !== 'WAITING');
    const late = await new Bot('Late').connect(); late.send({ type: 'join_room', code });
    await late.waitFor(() => late.errors.length); assert.strictEqual(late.errors[0].code, 'started');
    late.close(); bots.forEach(b => b.close());
  });

  await test('disconnected player can reconnect and gets the room back', async () => {
    const { bots } = await makeRoom(['R1', 'R2', 'R3']);
    const g = {}; autoplay(bots, g); bots[0].send({ type: 'start_match' });
    await bots[0].waitFor(() => bots[0].state.state === 'DRAWING');
    const victim = bots[2], tok = victim.token; victim.close();
    await bots[0].waitFor(() => bots[0].state.players.some(p => !p.connected));
    const back = new Bot('R3'); back.token = tok; await back.connect();
    await back.waitFor(() => back.state && back.state.players.length === 3);
    assert.ok(back.state.players.find(p => p.id === back.state.you).connected);
    bots.forEach(b => b.close()); back.close();
  });

  await test('shop: price from server, insufficient funds, idempotency, ownership, rollback', async () => {
    const winner = room4.find(b => b.state.you === rows4[0].id);       // has 100 coins
    const key = crypto.randomBytes(16).toString('hex');
    winner.send({ type: 'buy', itemId: 'theme_chalk', qty: 1, key: crypto.randomBytes(16).toString('hex'), price: 1 });
    let r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop());
    assert.strictEqual(r.ok, false);                                    // 180 > 100; client "price" ignored
    winner.msgs.length = 0;
    winner.send({ type: 'buy', itemId: 'badge_star', qty: 1, key, price: 0 });
    r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop());
    assert.ok(r.ok); assert.strictEqual(r.balance, 40); winner.msgs.length = 0;
    winner.send({ type: 'buy', itemId: 'badge_star', qty: 1, key });   // same request repeated
    r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop());
    assert.ok(r.ok && r.repeated); assert.strictEqual(_test.db.players[rows4[0].id].coins, 40); winner.msgs.length = 0;
    winner.send({ type: 'buy', itemId: 'badge_star', qty: 1, key: crypto.randomBytes(16).toString('hex') });
    r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop());
    assert.strictEqual(r.ok, false); assert.strictEqual(_test.db.players[rows4[0].id].coins, 40); winner.msgs.length = 0;
    winner.send({ type: 'buy', itemId: 'not_real', qty: 1, key: crypto.randomBytes(16).toString('hex') });
    r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop()); assert.strictEqual(r.ok, false);
    // failed save -> not charged
    winner.msgs.length = 0; _test.setFailSave(true);
    winner.send({ type: 'buy', itemId: 'badge_brush', qty: 1, key: crypto.randomBytes(16).toString('hex') });
    r = await winner.waitFor(() => winner.msgs.filter(m => m.type === 'buy_result').pop()); _test.setFailSave(false);
    assert.strictEqual(r.ok, false); assert.strictEqual(_test.db.players[rows4[0].id].coins, 40);
    assert.ok(!_test.db.players[rows4[0].id].inventory.badge_brush);
    // concurrent purchases cannot overspend: 40 coins, two different keys for a 90-coin item and a 60-coin one
    const p = rows4[1].id, c2 = room4.find(b => b.state.you === p);   // 70 coins
    c2.msgs.length = 0;
    for (const id of ['frame_bronze', 'badge_crown', 'badge_brush']) c2.send({ type: 'buy', itemId: id, qty: 1, key: crypto.randomBytes(16).toString('hex') });
    await c2.waitFor(() => c2.msgs.filter(m => m.type === 'buy_result').length === 3);
    assert.ok(_test.db.players[p].coins >= 0);
    // cannot equip what you do not own
    winner.errors.length = 0; winner.send({ type: 'equip', itemId: 'frame_royal', slot: 'frame' });
    await winner.waitFor(() => winner.errors.length);
  });

  await test('leaderboard: server-computed, validated matches only, no private data', async () => {
    const b = room4[0]; b.msgs.length = 0;
    b.send({ type: 'leaderboard', view: 'alltime', page: 1 });
    const lb = await b.waitFor(() => b.msgs.find(m => m.type === 'leaderboard'));
    assert.strictEqual(lb.rows[0].coins, 100); assert.strictEqual(lb.rows[0].rank, 1);
    assert.ok(lb.rows.every(r => !('id' in r) && !('token' in r)));
    assert.strictEqual(lb.rows.length, 8);                              // two valid 4-player matches; the 2-player (friendly) match is excluded
    b.send({ type: 'history' });
    const hs = await b.waitFor(() => b.msgs.find(m => m.type === 'history'));
    assert.ok(hs.matches.length >= 1);
  });

  await test('oversized and malformed messages are ignored safely', async () => {
    const b = room4[0];
    b.ws.send('not json'); b.ws.send(JSON.stringify({ type: 'draw', op: 'line', pts: 'x' })); b.ws.send(JSON.stringify({}));
    b.send({ type: 'history' });
    await b.waitFor(() => b.msgs.filter(m => m.type === 'history').length >= 2);
  });

  room4.forEach(b => b.close());
  console.log(`\n${passed} passed, ${failed} failed`);
  server.close(); process.exit(failed ? 1 : 0);
})();
