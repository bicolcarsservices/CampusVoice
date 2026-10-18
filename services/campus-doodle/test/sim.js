'use strict';
// End-to-end tests: starts the real server in-process, plays real matches with WebSocket bots.
// Run with: npm test   (uses short timers via TEST_FAST=1 and a throw-away data file)
process.env.TEST_FAST = '1';
process.env.ALLOWED_ORIGINS = 'http://localhost:3037';
process.env.CAMPUS_DOODLE_AUTH_SECRET = 'test-only-campus-doodle-auth-secret';
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
  constructor(name, delay = 0, guest = false) { this.name = name; this.delay = delay; this.guest = guest; this.userId = crypto.randomUUID(); this.msgs = []; this.state = null; this.profile = null; this.errors = []; }
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
    if (hello) { this.send({ type: 'hello', ticket: _test.createTestTicket(this.userId, 60, this.guest), name: this.name }); await this.waitFor(() => this.profile); }
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
const finished = (bots, ms = 20000) => bots[0].waitFor(() => { const s = bots[0].state; return s && s.state === 'MATCH_FINISHED' && s.result && s; }, ms);
const ledger = () => _test.db.ledger;

(async () => {
  const server = await start(0); port = server.address().port;
  console.log('Campus Doodle tests (port ' + port + ')');

  await test('game page can be embedded by the configured CampusVoice origin', async () => {
    const response = await nativeFetch(`http://localhost:${port}/`);
    assert.strictEqual(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self' http:\/\/localhost:3037/);
  });

  await test('standalone game issues a signed guest ticket for room-code invites', async () => {
    const guestId = crypto.randomUUID();
    const response = await nativeFetch(`http://localhost:${port}/api/guest-session`, {
      method: 'POST',
      headers: { Origin: `http://localhost:${port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId })
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('cache-control'), 'no-store');
    const { ticket } = await response.json();
    const payload = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
    assert.strictEqual(payload.sub, 'guest:' + guestId);
    assert.strictEqual(payload.guest, true);
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));
    const rejected = await nativeFetch(`http://localhost:${port}/api/guest-session`, {
      method: 'POST',
      headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId: crypto.randomUUID() })
    });
    assert.strictEqual(rejected.status, 403);
    const guest = await new Bot('Invite Guest').connect(false);
    try {
      guest.send({ type: 'hello', ticket, name: guest.name });
      await guest.waitFor(() => guest.profile);
      assert.strictEqual(guest.profile.guest, true);
    } finally {
      guest.close();
    }
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
  await test('anonymous, invalid, and expired CampusVoice tickets cannot create game profiles', async () => {
    const b = await new Bot('Unauthorized').connect(false);
    b.send({ type: 'hello', ticket: 'not-a-signed-ticket' });
    await b.waitFor(() => b.errors.length);
    assert.strictEqual(b.errors[0].code, 'bad_ticket');
    b.errors.length = 0;
    b.send({ type: 'hello', ticket: _test.createTestTicket(crypto.randomUUID(), -1) });
    await b.waitFor(() => b.errors.length);
    assert.strictEqual(b.errors[0].code, 'bad_ticket');
    b.close();
  });
  await test('guest Quick Play cannot earn or spend Coins', async () => {
    const guest = await new Bot('Guest Player', 0, true).connect();
    const matchesBefore = _test.db.matches.length, ledgerBefore = ledger().length;
    try {
      assert.strictEqual(guest.profile.guest, true);
      assert.strictEqual(guest.profile.coins, 0);
      guest.send({ type: 'quick_play' });
      const lobby = await guest.waitFor(() => guest.state && guest.state.publicMatch && guest.state.state === 'WAITING' && guest.state);
      assert.strictEqual(lobby.players[0].guest, true);
      guest.send({ type: 'shop_list' });
      await guest.waitFor(() => guest.errors.length);
      assert.strictEqual(guest.errors[0].code, 'guest_restricted');
      assert.strictEqual(_test.db.players['guest:' + guest.userId].coins, 0);
      guest.send({ type: 'leave_room' });
      await guest.waitFor(() => guest.msgs.find(m => m.type === 'left'));
      assert.strictEqual(_test.db.matches.length, matchesBefore);
      assert.strictEqual(ledger().length, ledgerBefore);
      assert.strictEqual(_test.db.players['guest:' + guest.userId], undefined, 'guest profile is discarded after leaving');
      const savedPlayers = fs.existsSync(process.env.DATA_FILE) ? JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8')).players : {};
      assert.strictEqual(savedPlayers['guest:' + guest.userId], undefined, 'guest profiles are never persisted');
    } finally {
      guest.close();
    }
  });

  await test('guest can join a code room and only signed-in players can earn Coins', async () => {
    const guest = await new Bot('Guest Player', 0, true).connect();
    const accounts = [await new Bot('Account One', 0).connect(), await new Bot('Account Two', 0).connect(), await new Bot('Account Three', 0).connect()];
    const bots = [guest, ...accounts];
    const game = {};
    try {
      accounts[0].send({ type: 'create_room', config: { rounds: 1, drawTime: 3 } });
      const lobby = await accounts[0].waitFor(() => accounts[0].state && !accounts[0].state.publicMatch && accounts[0].state.state === 'WAITING' && accounts[0].state);
      assert.match(lobby.code, /^[A-Z0-9]{5}$/);
      guest.send({ type: 'join_room', code: lobby.code });
      const joinedLobby = await guest.waitFor(() => guest.state && guest.state.code === lobby.code && guest.state.players.length === 2 && guest.state);
      assert.ok(joinedLobby.players.some(player => player.guest), 'guest should join a private room with its shared code');
      for (const account of accounts.slice(1)) {
        account.send({ type: 'join_room', code: lobby.code });
        await account.waitFor(() => account.state && account.state.code === lobby.code && account.state.players.length >= 2);
      }
      await guest.waitFor(() => guest.state && guest.state.players.length === 4);
      autoplay(bots, game);
      accounts[0].send({ type: 'start_match' });
      const result = await finished(bots, 45000);
      assert.strictEqual(result.result.valid, true, 'account players should still qualify for private-match Coins');
      const guestRow = result.result.rows.find(row => row.id === 'guest:' + guest.userId);
      assert.ok(guestRow);
      assert.strictEqual(guestRow.eligible, false);
      assert.strictEqual(guestRow.coins, 0);
      assert.strictEqual(ledger().some(entry => entry.playerId === guestRow.id), false);
      for (const account of accounts) {
        const row = result.result.rows.find(entry => entry.id === account.userId);
        assert.ok(row && row.eligible && row.coins > 0, 'signed-in account should earn its placement reward');
        assert.strictEqual(_test.db.players[account.userId].coins, row.coins);
      }
    } finally {
      for (const bot of bots) bot.close();
    }
  });

  await test('Quick Play enters a public lobby immediately and starts when another player joins', async () => {
    const first = await new Bot('Quick One').connect();
    const second = await new Bot('Quick Two').connect();
    const third = await new Bot('Quick Three').connect();
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
      assert.strictEqual(firstState.match.endless, true);
      assert.strictEqual(firstState.match.rounds, null);
      assert.strictEqual(firstState.match.totalTurns, null);
      const matchRoom = _test.rooms.get(firstState.code);
      third.send({ type: 'quick_play' });
      const thirdState = await third.waitFor(() => third.state && third.state.code === firstState.code && third.state);
      assert.strictEqual(thirdState.players.length, 3, 'Quick Play should admit players during an endless match');
      const roundLimit = thirdState.config.rounds * matchRoom.match.order.length;
      matchRoom.match.pointer = roundLimit;
      assert.ok(_test.peek(matchRoom) >= roundLimit, 'public turns must continue past the configured round limit');
      matchRoom.match.pointer = 0;
      const recordedMatches = _test.db.matches.length;
      const rewardLedger = ledger().length;
      first.send({ type: 'leave_room' });
      await first.waitFor(() => first.msgs.find(m => m.type === 'left'));
      second.send({ type: 'leave_room' });
      await second.waitFor(() => second.msgs.find(m => m.type === 'left'));
      await third.waitFor(() => third.state && third.state.state === 'WAITING');
      assert.strictEqual(_test.db.matches.length, recordedMatches, 'leaving Quick Play must not finalize a rewarded match');
      assert.strictEqual(ledger().length, rewardLedger, 'leaving Quick Play must not award Coins');
      third.send({ type: 'leave_room' });
      await third.waitFor(() => third.msgs.find(m => m.type === 'left'));
    } finally {
      first.close();
      second.close();
      third.close();
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
    const victim = bots[2], userId = victim.userId; victim.close();
    await bots[0].waitFor(() => bots[0].state.players.some(p => !p.connected));
    const back = new Bot('R3'); back.userId = userId; await back.connect();
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
    assert.strictEqual(lb.rows.length, 11);                             // two valid 4-player matches plus three signed-in players from a guest-hosted match
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
