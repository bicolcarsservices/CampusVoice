(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const PALETTE = ['#14213d', '#ffffff', '#8d99ae', '#e63946', '#f77f00', '#ffd60a', '#6a994e', '#2a9d8f', '#1d7fd6', '#4c3bcf', '#9d4edd', '#f06eaa', '#8b5a2b', '#ffb899', '#000000', '#c0c0c0'];
const SIZES = [2, 4, 8, 14, 22, 34];

/* ───────── session ───────── */
function newToken() { const a = new Uint8Array(24); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
let token = localStorage.getItem('cd_token'); if (!token) { token = newToken(); localStorage.setItem('cd_token', token); }
let myName = localStorage.getItem('cd_name') || '';
let ws, retry = 0, profile = null, catalog = [], limits = null;
let room = null, view = 'home', skew = 0, seenTurn = -2, seenState = '';
let boardView = 'weekly', boardPage = 1, pendingKeys = {};

function toast(msg, bad) { const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg }); $('#toasts').append(t); setTimeout(() => t.remove(), 3500); }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied!');
    return;
  } catch (_) {
    const field = h('input', { type: 'text', readonly: true, 'aria-label': 'Text to copy', value: text });
    field.style.cssText = 'display:block;width:100%;margin-top:8px;padding:8px;border-radius:6px;user-select:all';
    const message = h('div', { class: 'toast bad' }, 'Copy it manually with Ctrl+C or long-press:', field);
    $('#toasts').append(message);
    field.focus();
    field.select();
  }
}

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { retry = 0; $('#dot').classList.add('on'); $('#banner').hidden = true; send({ type: 'hello', token, name: myName || undefined }); };
  ws.onclose = () => { $('#dot').classList.remove('on'); if (!replaced) { $('#banner').hidden = false; setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); } };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
}
let replaced = false;

function onMsg(m) {
  switch (m.type) {
    case 'hello': profile = m.profile; catalog = m.catalog; limits = m.config; if (!myName) { myName = profile.name; localStorage.setItem('cd_name', myName); } initHome(); updateCoins(); break;
    case 'profile': profile = m.profile; updateCoins(); break;
    case 'state': onState(m.state); break;
    case 'chat': addChat(m.msg); break;
    case 'chatlog': $('#log').replaceChildren(); m.msgs.forEach(addChat); break;
    case 'draw': drawStroke(m.stroke); break;
    case 'clear': clearCanvas(); break;
    case 'replay': clearCanvas(); m.strokes.forEach(drawStroke); break;
    case 'left': room = null; seenTurn = -2; setView('home'); break;
    case 'error': toast(m.message, true); break;
    case 'replaced': replaced = true; $('#banner').textContent = 'Opened in another tab. Reload to play here.'; $('#banner').hidden = false; break;
    case 'leaderboard': renderBoard(m); break;
    case 'shop': renderShop(m); break;
    case 'history': renderHistory(m.matches); break;
    case 'buy_result': delete pendingKeys[m.itemId]; if (m.ok) toast(m.repeated ? 'Already purchased.' : 'Purchased!'); else toast(m.message, true); break;
    default:
  }
}
function updateCoins() { if (profile) $('#coins').textContent = profile.coins + ' Coins'; }

/* ───────── views ───────── */
function setView(v) {
  view = v;
  for (const id of ['home', 'practice', 'room', 'board', 'shop', 'inventory', 'history']) $('#v-' + id).hidden = id !== (v === 'home' && room ? 'room' : v);
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'board') send({ type: 'leaderboard', view: boardView, page: boardPage });
  if (v === 'shop' || v === 'inventory') send({ type: 'shop_list' });
  if (v === 'history') send({ type: 'history' });
}
$$('.nav button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#brand').addEventListener('click', () => setView('home'));

function initHome() {
  $('#name').value = myName;
  const r = $('#cfg-rounds'), t = $('#cfg-time');
  if (!r.options.length) {
    for (let i = limits.rounds.min; i <= limits.rounds.max; i++) r.append(h('option', { value: i, text: i + (i === 1 ? ' round' : ' rounds') }));
    r.value = limits.rounds.def;
    for (const s of [30, 45, 60, 80, 100, 120].filter(s => s >= limits.drawTime.min && s <= limits.drawTime.max)) t.append(h('option', { value: s, text: s + ' seconds' }));
    t.value = limits.drawTime.def;
  }
  const rw = limits.rewards;
  $('#reward-note').textContent = `Match rewards: 1st ${rw[1]}, 2nd ${rw[2]}, 3rd ${rw[3]}, 4th ${rw[4]} Coins. Matches need ${limits.rewardMinPlayers}+ players to pay out. Rewards are decided by the server.`;
}
$('#name').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (v.length < 2) { toast('Names need at least 2 characters.', true); e.target.value = myName; return; }
  myName = v; localStorage.setItem('cd_name', v); send({ type: 'hello', token, name: v });
});
$('#create').addEventListener('click', () => send({ type: 'create_room', config: { rounds: +$('#cfg-rounds').value, drawTime: +$('#cfg-time').value } }));
$('#join').addEventListener('click', () => send({ type: 'join_room', code: $('#code').value }));
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#join').click(); });
{ const q = new URLSearchParams(location.search).get('room'); if (q) $('#code').value = q.slice(0, 5).toUpperCase(); }

/* ───────── room ───────── */
const cv = $('#cv'), cx = cv.getContext('2d');
function clearCanvas() { cx.clearRect(0, 0, cv.width, cv.height); }
function drawStrokeOn(context, canvas, s) {
  context.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
  context.strokeStyle = PALETTE[s.c]; context.lineWidth = SIZES[s.s]; context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath();
  const [x0, y0] = s.pts[0];
  context.moveTo(x0 * canvas.width, y0 * canvas.height);
  if (s.pts.length === 1) context.lineTo(x0 * canvas.width + 0.01, y0 * canvas.height);
  for (let i = 1; i < s.pts.length; i++) context.lineTo(s.pts[i][0] * canvas.width, s.pts[i][1] * canvas.height);
  context.stroke();
  context.globalCompositeOperation = 'source-over';
}
function drawStroke(s) { drawStrokeOn(cx, cv, s); }
const me = () => room && room.players.find(p => p.id === room.you);
const amArtist = () => room && room.turn && room.state === 'DRAWING' && room.turn.artistId === room.you && room.turn.phase === 'drawing';

function onState(s) {
  const prevCode = room && room.code;
  room = s;
  if (!prevCode || prevCode !== s.code) { seenTurn = -2; setView('home'); }
  const ti = s.turn ? s.turn.index : -1;
  if (s.state === 'DRAWING' && ti !== seenTurn) { seenTurn = ti; clearCanvas(); }
  if (s.state === 'WAITING') seenTurn = -2;
  skew = s.serverNow - Date.now();
  if (s.state === 'MATCH_FINISHED' && seenState !== 'MATCH_FINISHED' && s.result) {
    const mine = s.result.rows.find(r => r.id === s.you);
    if (mine && mine.coins > 0) toast(`You placed #${mine.rank} and earned ${mine.coins} Coins!`);
    else if (s.result.reason) toast('No Coins this match: ' + reasonText(s.result.reason));
  }
  seenState = s.state;
  if (view === 'home') setView('home');
  renderRoom();
}
function reasonText(r) {
  return ({ too_few_players: `matches need ${limits ? limits.rewardMinPlayers : 3}+ players who stayed for the match`, too_few_turns: 'the match was too short', too_few_correct_guesses: 'too few correct guesses', held_for_review: 'this group has played many matches recently, so it is held for review', cancelled: 'the match was cancelled', processing: 'the result is still being saved, please wait' })[r] || 'the match did not qualify';
}
function avatar(p, size) {
  const f = p.cos && p.cos.frame ? catalog.find(i => i.id === p.cos.frame) : null;
  const a = h('div', { class: 'av', text: (p.name[0] || '?').toUpperCase(), 'aria-hidden': 'true' });
  a.style.background = `hsl(${p.hue} 60% 45%)`;
  a.style.borderColor = f ? f.style.color : 'transparent';
  if (size) { a.style.width = a.style.height = size + 'px'; }
  return a;
}
function badgeOf(p) { const b = p.cos && p.cos.badge && catalog.find(i => i.id === p.cos.badge); return b ? b.style.emoji + ' ' : ''; }
function titleOf(p) { const t = p.cos && p.cos.title && catalog.find(i => i.id === p.cos.title); return t ? t.style.text : ''; }

function renderRoom() {
  if (!room) return;
  $('#v-room').hidden = view !== 'home';
  $('#v-home').hidden = !!room && view === 'home';
  // players
  const list = $('#plist'); list.replaceChildren();
  for (const p of room.players) {
    list.append(h('li', { class: 'pl' + (p.artist ? ' artist' : '') + (p.guessed ? ' guessed' : '') + (!p.connected || p.left ? ' off' : '') },
      avatar(p),
      h('div', {}, h('div', { class: 'nm', text: badgeOf(p) + p.name + (p.id === room.you ? ' (you)' : '') }),
        h('div', { class: 'sub', text: p.left ? 'left' : !p.connected ? 'reconnecting…' : p.artist ? 'drawing' : p.guessed ? 'guessed it' : p.host ? 'host' : '' }),
        titleOf(p) ? h('div', { class: 'title-tag', text: titleOf(p) }) : null),
      h('div', { class: 'sc', text: String(p.score) })));
  }
  // top bar
  const t = room.turn, st = room.state;
  $('#round').textContent = st === 'WAITING' ? 'Room ' + room.code : st === 'MATCH_FINISHED' ? 'Finished' : (t ? `Round ${t.round}/${room.config.rounds}` : 'Starting');
  const hint = $('#hint');
  if (st === 'DRAWING' && t && t.phase === 'drawing') hint.textContent = (t.word ? t.word : (t.hint || []).join(' '));
  else if (st === 'DRAWING') hint.textContent = '';
  else if (t && t.word && (st === 'ROUND_RESULTS' || st === 'NEXT_ROUND')) hint.textContent = t.word;
  else hint.textContent = '';
  // theme (personal)
  const th = profile && profile.equipped.theme && catalog.find(i => i.id === profile.equipped.theme);
  $('#boardwrap').style.background = th ? th.style.bg : '#fff';
  // tools & chat placeholder
  $('#tools').hidden = !amArtist();
  const guessing = st === 'DRAWING' && t && t.phase === 'drawing' && room.you !== t.artistId && !t.word;
  $('#chatin').placeholder = guessing ? 'Type your guess' : 'Chat with your room';
  renderOverlay();
}
function renderOverlay() {
  const ov = $('#overlay'), st = room.state, t = room.turn, isHost = room.hostId === room.you;
  ov.replaceChildren();
  const byId = id => room.players.find(p => p.id === id);
  let show = true;
  if (st === 'WAITING') {
    const connected = room.players.filter(p => p.connected && !p.left).length;
    ov.append(h('h2', { text: 'Waiting for players' }), h('div', { class: 'code', text: room.code }),
      h('button', { class: 'btn small', onclick: () => copy(room.code) }, 'Copy code'),
      h('button', { class: 'btn small', onclick: () => copy(location.origin + '/?room=' + room.code) }, 'Copy invite link'),
      h('div', { text: `${connected} of ${limits.maxPlayers} players` }));
    if (isHost) {
      const r = h('select', { 'aria-label': 'Rounds', onchange: () => send({ type: 'update_config', config: { rounds: +r.value } }) });
      for (let i = limits.rounds.min; i <= limits.rounds.max; i++) r.append(h('option', { value: i, text: i + ' round' + (i > 1 ? 's' : '') }));
      r.value = room.config.rounds;
      const d = h('select', { 'aria-label': 'Drawing time', onchange: () => send({ type: 'update_config', config: { drawTime: +d.value } }) });
      for (const s of [30, 45, 60, 80, 100, 120].filter(s => s >= limits.drawTime.min)) d.append(h('option', { value: s, text: s + ' s' }));
      d.value = room.config.drawTime;
      ov.append(h('div', {}, r, ' ', d),
        h('button', { class: 'btn primary', disabled: connected < room.minPlayers, onclick: () => send({ type: 'start_match' }) }, 'Start match'),
        connected < room.minPlayers ? h('div', { class: 'small', text: `Need at least ${room.minPlayers} players.` }) : null);
    } else ov.append(h('div', { text: `${room.config.rounds} rounds, ${room.config.drawTime}s each. Waiting for the host to start.` }));
    ov.append(h('button', { class: 'btn small', onclick: leave }, 'Leave room'),
      h('div', { class: 'small', text: `Coins are awarded only when ${room.rewardMinPlayers}+ players finish the match.` }));
  } else if (st === 'STARTING') {
    ov.append(h('h2', { text: 'Get ready…' }));
  } else if (st === 'DRAWING' && t.phase === 'choosing') {
    if (t.choices) ov.append(h('h2', { text: 'Pick a word to draw' }), h('div', { class: 'choices' }, t.choices.map((w, i) => h('button', { class: 'btn', onclick: () => send({ type: 'choose_word', index: i }) }, w))));
    else ov.append(h('h2', { text: `${(byId(t.artistId) || {}).name || 'The artist'} is choosing a word…` }));
  } else if (st === 'ROUND_RESULTS') {
    ov.append(h('h2', { text: `The word was “${t.word || '?'}”` }));
    const rows = Object.entries(t.deltas || {});
    if (rows.length) ov.append(h('table', {}, h('tbody', {}, rows.map(([id, d]) => h('tr', {}, h('td', { text: (byId(id) || {}).name || '' }), h('td', { text: '+' + d }))))));
    else ov.append(h('div', { text: 'Nobody guessed it.' }));
  } else if (st === 'NEXT_ROUND') {
    ov.append(h('h2', { text: `Round ${room.next.round}` }), h('div', { text: `${(byId(room.next.artistId) || {}).name || ''} draws next` }));
  } else if (st === 'MATCH_FINISHED') {
    const res = room.result;
    ov.append(h('h2', { text: 'Final results' }));
    if (res) {
      ov.append(h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Player', 'Score', 'Coins'].map(x => h('th', { text: x })))),
        h('tbody', {}, res.rows.map(r => h('tr', {}, h('td', { text: r.rank }), h('td', { text: r.name + (r.id === room.you ? ' (you)' : '') }), h('td', { text: r.score }), h('td', { text: r.coins ? '+' + r.coins : '0' }))))));
      const mine = res.rows.find(r => r.id === room.you);
      if (!res.valid) ov.append(h('div', { class: 'small', text: 'No Coins this match: ' + reasonText(res.reason) }));
      else if (mine && !mine.eligible) ov.append(h('div', { class: 'small', text: 'You were away too long to qualify for Coins.' }));
      if (profile) ov.append(h('div', { text: `Balance: ${profile.coins} Coins` }));
    }
    ov.append(h('div', {}, isHost ? h('button', { class: 'btn primary', onclick: () => send({ type: 'rematch' }) }, 'Play again') : h('span', { class: 'small', text: 'Waiting for the host to start a rematch.' }), ' ', h('button', { class: 'btn small', onclick: leave }, 'Leave room')));
  } else show = false;
  ov.hidden = !show;
}
function leave() { send({ type: 'leave_room' }); }

/* timer */
setInterval(() => {
  if (!room) return;
  let end = 0;
  if (room.state === 'DRAWING' && room.turn) end = room.turn.endsAt; else if (['STARTING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(room.state)) end = room.deadline;
  const el = $('#timer');
  if (!end) { el.textContent = '–'; return; }
  el.textContent = Math.max(0, Math.ceil((end - (Date.now() + skew)) / 1000)) + 's';
}, 250);

/* chat */
function addChat(m) {
  const log = $('#log');
  const row = h('div', { class: 'm ' + m.kind });
  if (m.kind === 'chat' || m.kind === 'guess' || m.kind === 'team') row.append(h('b', { text: m.name + ': ' }), m.text);
  else if (m.kind === 'correct') row.append(h('b', { text: m.name }), ' ' + m.text);
  else row.textContent = m.text;
  log.append(row);
  while (log.children.length > 150) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
$('#chatform').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatin').value.trim();
  if (v) send({ type: 'guess', text: v });
  $('#chatin').value = '';
});

/* drawing input */
let color = 0, sizeIdx = 2, eraser = false, drawing = false, buf = [], last = null, flushTimer = null;
function buildTools() {
  const sw = $('#swatches');
  PALETTE.forEach((c, i) => { const b = h('button', { class: 'sw', role: 'radio', 'aria-label': 'Colour ' + (i + 1), 'aria-checked': i === color, onclick: () => { color = i; eraser = false; syncTools(); } }); b.style.background = c; sw.append(b); });
  const sz = $('#sizes');
  SIZES.forEach((s, i) => { const d = h('i'); d.style.width = d.style.height = Math.min(22, 4 + s * 0.6) + 'px'; sz.append(h('button', { class: 'sz', role: 'radio', 'aria-label': 'Brush size ' + (i + 1), 'aria-checked': i === sizeIdx, onclick: () => { sizeIdx = i; syncTools(); } }, d)); });
  $('#eraser').addEventListener('click', () => { eraser = !eraser; syncTools(); });
  $('#clear').addEventListener('click', () => { clearCanvas(); send({ type: 'draw', op: 'clear' }); });
}
function syncTools() {
  $$('#swatches .sw').forEach((b, i) => b.setAttribute('aria-checked', String(i === color && !eraser)));
  $$('#sizes .sz').forEach((b, i) => b.setAttribute('aria-checked', String(i === sizeIdx)));
  $('#eraser').setAttribute('aria-pressed', String(eraser));
}
buildTools();
function pt(e) {
  const r = cv.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
}
function flush() {
  flushTimer = null;
  if (!buf.length) return;
  const s = { op: 'line', pts: buf, c: color, s: sizeIdx, e: eraser };
  send({ type: 'draw', ...s });
  last = buf[buf.length - 1]; buf = [last];
  if (buf.length === 1 && !drawing) buf = [];
}
cv.addEventListener('pointerdown', e => {
  if (!amArtist()) return;
  cv.setPointerCapture(e.pointerId); drawing = true;
  const p = pt(e); buf = [p]; last = p;
  drawStroke({ pts: [p], c: color, s: sizeIdx, e: eraser });
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!drawing) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    const p = pt(ev);
    drawStroke({ pts: [last, p], c: color, s: sizeIdx, e: eraser });
    buf.push(p); last = p;
  }
  if (buf.length >= 16) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 40);
});
function endStroke() {
  if (!drawing) return;
  drawing = false;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (buf.length) { send({ type: 'draw', op: 'line', pts: buf.slice(0, 32), c: color, s: sizeIdx, e: eraser }); }
  buf = []; last = null;
}
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);

/* ───────── solo AI practice ───────── */
const practiceCanvas = $('#practice-canvas'), practiceContext = practiceCanvas.getContext('2d');
const practice = { words: [], used: new Set(), rounds: 0, seconds: 60, turn: 0, correct: 0, total: 0, word: '', choices: [], color: 0, size: 2, eraser: false, drawing: false, points: [], deadline: 0, timerInterval: null, submitting: false };
for (let rounds = 1; rounds <= 6; rounds++) $('#practice-rounds').append(h('option', { value: rounds, text: rounds + (rounds === 1 ? ' round' : ' rounds') }));
for (const seconds of [30, 45, 60, 80, 100, 120]) $('#practice-time').append(h('option', { value: seconds, text: seconds + ' seconds' }));
$('#practice-time').value = '60';

function practiceClear() { practiceContext.clearRect(0, 0, practiceCanvas.width, practiceCanvas.height); }
function stopPracticeTimer() {
  if (practice.timerInterval) clearInterval(practice.timerInterval);
  practice.timerInterval = null;
  practice.deadline = 0;
  $('#practice-timer').textContent = '–';
}
function startPracticeTimer() {
  stopPracticeTimer();
  practice.deadline = Date.now() + practice.seconds * 1000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((practice.deadline - Date.now()) / 1000));
    $('#practice-timer').textContent = remaining + 's';
    if (!remaining) {
      stopPracticeTimer();
      if (practice.turn % 2 === 0) {
        $$('#practice-choices button').forEach(button => { button.disabled = true; });
        finishPracticeTurn(false, `Time is up — the drawing was ${practice.word}.`);
      } else submitPracticeDrawing(true);
    }
  };
  tick();
  practice.timerInterval = setInterval(tick, 250);
}
function setPracticeMessage(message, error = false) {
  const target = $('#practice-error');
  target.textContent = message;
  target.classList.toggle('bad', error);
}
async function practiceRequest(path, body) {
  let response;
  try {
    response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  } catch (_) {
    throw new Error('Could not connect to the practice service. Please check your connection.');
  }
  let data;
  try { data = await response.json(); } catch (_) { throw new Error('The practice service returned an unreadable response.'); }
  if (!response.ok) throw new Error(data.error || 'AI practice is temporarily unavailable.');
  return data;
}
function choosePracticeWords(count) {
  if (practice.words.length - practice.used.size < count) throw new Error('Not enough unused practice words for this session.');
  const available = practice.words.filter(word => !practice.used.has(word));
  const selected = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * available.length);
    const [word] = available.splice(index, 1);
    practice.used.add(word); selected.push(word);
  }
  return selected;
}
function practiceDrawStroke(stroke) { drawStrokeOn(practiceContext, practiceCanvas, stroke); }
function showPracticeResult(message, correct) {
  const output = $('#practice-result');
  output.textContent = message;
  output.classList.toggle('good', correct);
  output.classList.toggle('bad', !correct);
}
function normalizePracticeGuess(value) {
  return value.trim().toLocaleLowerCase('en-US').replace(/^(a|an|the)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function renderPracticeChoices(choices, callback) {
  const container = $('#practice-choices');
  container.replaceChildren(...choices.map(word => h('button', {
    class: 'btn', type: 'button', onclick: () => {
      $$('#practice-choices button').forEach(button => { button.disabled = true; });
      callback(word);
    }
  }, word)));
}
function updatePracticeProgress() {
  const round = Math.min(Math.floor(practice.turn / 2) + 1, practice.rounds);
  $('#practice-round-label').textContent = `Round ${round} of ${practice.rounds}`;
  $('#practice-score').textContent = `${practice.correct} correct`;
}
function finishPracticeTurn(correct, message) {
  stopPracticeTimer();
  practice.total++;
  if (correct) practice.correct++;
  $('#practice-status').textContent = 'Turn complete';
  $('#practice-guess-form').hidden = true;
  showPracticeResult(message, correct);
  $('#practice-next').hidden = false;
  $('#practice-next').textContent = practice.turn + 1 >= practice.rounds * 2 ? 'Finish practice' : 'Continue';
  updatePracticeProgress();
}
async function beginPracticeTurn() {
  stopPracticeTimer();
  practice.submitting = false;
  $('#practice-next').hidden = true;
  $('#practice-result').textContent = '';
  $('#practice-result').classList.remove('good', 'bad');
  $('#practice-choices').replaceChildren();
  $('#practice-guess-form').hidden = true;
  $('#practice-guess').value = '';
  $('#practice-tools').hidden = true;
  $('#practice-submit').disabled = false;
  practiceClear();
  updatePracticeProgress();
  if (practice.turn >= practice.rounds * 2) {
    $('#practice-status').textContent = 'Practice complete';
    $('#practice-prompt').textContent = `You got ${practice.correct} of ${practice.total} turns correct.`;
    $('#practice-next').textContent = 'Start another practice';
    $('#practice-next').hidden = false;
    return;
  }
  if (practice.turn % 2 === 0) {
    practice.choices = choosePracticeWords(3);
    $('#practice-status').textContent = 'AI is drawing…';
    $('#practice-prompt').textContent = 'Guess what the AI is drawing:';
    try {
      const result = await practiceRequest('/api/ai/draw', { choices: practice.choices });
      practice.word = result.word;
      result.strokes.forEach(practiceDrawStroke);
      $('#practice-status').textContent = 'Type your guess';
      $('#practice-guess-form').hidden = false;
      $('#practice-guess').focus();
      startPracticeTimer();
    } catch (error) {
      $('#practice-status').textContent = 'AI turn unavailable';
      showPracticeResult(error.message, false);
      $('#practice-next').textContent = 'Try this turn again';
      $('#practice-next').hidden = false;
      practice.turn--;
    }
    return;
  }
  practice.choices = choosePracticeWords(3);
  $('#practice-status').textContent = 'Your turn to draw';
  $('#practice-prompt').textContent = 'Choose one word to draw. The AI will guess without choices.';
  renderPracticeChoices(practice.choices, word => {
    practice.word = word;
    $('#practice-choices').replaceChildren();
    $('#practice-prompt').textContent = `Draw: ${word}`;
    $('#practice-status').textContent = 'Draw, then ask AI to guess';
    $('#practice-tools').hidden = false;
    startPracticeTimer();
  });
}
$('#practice-start').addEventListener('click', async () => {
  const button = $('#practice-start');
  button.disabled = true;
  setPracticeMessage('');
  try {
    const status = await practiceRequest('/api/ai/status');
    if (!status.available) throw new Error(status.message || 'Local AI is unavailable. Start Ollama and install its vision model. Multiplayer remains available.');
    const bank = await practiceRequest('/api/words');
    if (!Array.isArray(bank.words) || bank.words.length < 1000) throw new Error('The practice word bank is unavailable.');
    practice.words = bank.words;
    practice.used = new Set();
    practice.rounds = Number($('#practice-rounds').value);
    practice.seconds = Number($('#practice-time').value);
    practice.turn = 0;
    practice.correct = 0;
    practice.total = 0;
    $('#practice-setup').hidden = true;
    $('#practice-game').hidden = false;
    await beginPracticeTurn();
  } catch (error) {
    setPracticeMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$('#practice-guess-form').addEventListener('submit', event => {
  event.preventDefault();
  const guess = $('#practice-guess').value;
  if (!guess.trim()) {
    $('#practice-guess').focus();
    return;
  }
  const correct = normalizePracticeGuess(guess) === normalizePracticeGuess(practice.word);
  finishPracticeTurn(correct, correct
    ? `Correct — it was ${practice.word}!`
    : `Not quite — your guess was "${guess.trim()}". The drawing was ${practice.word}.`);
});
$('#practice-next').addEventListener('click', async () => {
  if (practice.turn + 1 >= practice.rounds * 2 && $('#practice-status').textContent === 'Practice complete') {
    $('#practice-game').hidden = true;
    $('#practice-setup').hidden = false;
    return;
  }
  practice.turn++;
  await beginPracticeTurn();
});
async function submitPracticeDrawing(timedOut = false) {
  if (practice.submitting) return;
  practice.submitting = true;
  stopPracticeTimer();
  const button = $('#practice-submit');
  button.disabled = true;
  $('#practice-status').textContent = timedOut ? 'Time is up — AI is guessing…' : 'AI is guessing…';
  try {
    const result = await practiceRequest('/api/ai/guess', { image: practiceCanvas.toDataURL('image/png') });
    const correct = normalizePracticeGuess(result.word) === normalizePracticeGuess(practice.word);
    finishPracticeTurn(correct,
      correct ? `AI guessed correctly: ${result.word}.` : `AI guessed "${result.word}"; your word was ${practice.word}.`);
  } catch (error) {
    button.disabled = false;
    practice.submitting = false;
    if (timedOut) finishPracticeTurn(false, `Time is up. AI could not guess: ${error.message} Your word was ${practice.word}.`);
    else {
      $('#practice-status').textContent = 'AI guess unavailable';
      showPracticeResult(error.message, false);
    }
  }
}
$('#practice-submit').addEventListener('click', () => submitPracticeDrawing());
$('#practice-clear').addEventListener('click', practiceClear);
function syncPracticeTools() {
  $$('#practice-swatches .sw').forEach((button, index) => button.setAttribute('aria-checked', String(index === practice.color && !practice.eraser)));
  $$('#practice-sizes .sz').forEach((button, index) => button.setAttribute('aria-checked', String(index === practice.size)));
  $('#practice-eraser').setAttribute('aria-pressed', String(practice.eraser));
}
PALETTE.forEach((paint, index) => {
  const button = h('button', {
    class: 'sw', type: 'button', role: 'radio', 'aria-label': 'Colour ' + (index + 1), 'aria-checked': index === practice.color,
    onclick: () => { practice.color = index; practice.eraser = false; syncPracticeTools(); }
  });
  button.style.background = paint;
  $('#practice-swatches').append(button);
});
SIZES.forEach((width, index) => {
  const dot = h('i');
  dot.style.width = dot.style.height = Math.min(22, 4 + width * 0.6) + 'px';
  $('#practice-sizes').append(h('button', {
    class: 'sz', type: 'button', role: 'radio', 'aria-label': 'Brush size ' + (index + 1), 'aria-checked': index === practice.size,
    onclick: () => { practice.size = index; syncPracticeTools(); }
  }, dot));
});
$('#practice-eraser').addEventListener('click', () => { practice.eraser = !practice.eraser; syncPracticeTools(); });
function practicePoint(event) {
  const rect = practiceCanvas.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))];
}
practiceCanvas.addEventListener('pointerdown', event => {
  if ($('#practice-tools').hidden || $('#practice-submit').disabled) return;
  practiceCanvas.setPointerCapture(event.pointerId);
  practice.drawing = true;
  const point = practicePoint(event);
  practice.points = [point];
  practiceDrawStroke({ pts: [point], c: practice.color, s: practice.size, e: practice.eraser });
  event.preventDefault();
});
practiceCanvas.addEventListener('pointermove', event => {
  if (!practice.drawing) return;
  const point = practicePoint(event);
  const previous = practice.points[practice.points.length - 1];
  practiceDrawStroke({ pts: [previous, point], c: practice.color, s: practice.size, e: practice.eraser });
  practice.points.push(point);
});
function endPracticeStroke() { practice.drawing = false; }
practiceCanvas.addEventListener('pointerup', endPracticeStroke);
practiceCanvas.addEventListener('pointercancel', endPracticeStroke);

/* ───────── leaderboard ───────── */
$('#boardtabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  boardView = b.dataset.b; boardPage = 1;
  $$('#boardtabs button').forEach(x => x.classList.toggle('active', x === b));
  send({ type: 'leaderboard', view: boardView, page: boardPage });
});
$('#bprev').addEventListener('click', () => { if (boardPage > 1) { boardPage--; send({ type: 'leaderboard', view: boardView, page: boardPage }); } });
$('#bnext').addEventListener('click', () => { boardPage++; send({ type: 'leaderboard', view: boardView, page: boardPage }); });
function renderBoard(m) {
  boardPage = m.page;
  const body = $('#boardbody'); body.replaceChildren();
  if (!m.rows.length) { body.append(h('p', { class: 'muted', text: 'No validated matches yet. Finish a match with 3+ players to appear here.' })); }
  else {
    const col = m.view === 'score' ? ['Score', 'score'] : null;
    body.append(h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Rank', 'Player', 'Coins earned', 'Wins', 'Matches'].concat(col ? [col[0]] : []).map((x, i) => h('th', { class: i > 1 ? 'num' : '', text: x })))),
      h('tbody', {}, m.rows.map(r => h('tr', { class: r.me ? 'me' : '' },
        h('td', { text: '#' + r.rank }),
        h('td', {}, (() => { const d = h('span', { class: 'av', text: r.name[0].toUpperCase() }); d.style.background = `hsl(${r.hue} 60% 45%)`; d.style.display = 'inline-grid'; d.style.width = d.style.height = '26px'; d.style.marginRight = '8px'; d.style.verticalAlign = 'middle'; d.style.borderWidth = '0'; return d; })(), r.name),
        h('td', { class: 'num', text: r.coins }), h('td', { class: 'num', text: r.wins }), h('td', { class: 'num', text: r.matches }),
        col ? h('td', { class: 'num', text: r.score }) : null)))));
    if (m.mine && !m.rows.some(r => r.me)) body.append(h('p', { text: `Your rank: #${m.mine.rank} with ${m.mine.coins} Coins earned.` }));
  }
  $('#bpage').textContent = `Page ${m.page} of ${m.pages}`;
  $('#bprev').disabled = m.page <= 1; $('#bnext').disabled = m.page >= m.pages;
}

/* ───────── shop & inventory ───────── */
function preview(i) {
  const p = h('div', { class: 'preview' });
  if (i.type === 'frame') { p.textContent = ''; p.style.borderColor = i.style.color; p.style.borderStyle = 'solid'; p.style.borderWidth = '6px'; }
  else if (i.type === 'badge') p.textContent = i.style.emoji;
  else if (i.type === 'title') p.textContent = i.style.text;
  else if (i.type === 'theme') { p.style.background = i.style.bg; }
  if (i.type === 'title') p.style.fontSize = '16px';
  return p;
}
function renderShop(m) {
  profile && (profile.coins = m.coins); updateCoins();
  const shop = $('#shopbody'), inv = $('#invbody');
  shop.replaceChildren(); inv.replaceChildren();
  for (const i of m.items) {
    const ownedFull = i.owned >= i.maxOwned;
    const btn = h('button', { class: 'btn small primary', disabled: ownedFull || m.coins < i.price, onclick: () => {
      pendingKeys[i.id] = pendingKeys[i.id] || newToken().slice(0, 32);
      send({ type: 'buy', itemId: i.id, qty: 1, key: pendingKeys[i.id] });
    } }, ownedFull ? 'Owned' : m.coins < i.price ? `Need ${i.price - m.coins} more` : 'Buy');
    shop.append(h('div', { class: 'item' }, preview(i), h('b', { text: i.name }), h('div', { class: 'type', text: i.desc }), h('div', { class: 'price', text: i.price + ' Coins' }), btn));
    if (i.owned > 0) {
      inv.append(h('div', { class: 'item' }, preview(i), h('b', { text: i.name }), h('div', { class: 'type', text: i.type }),
        i.equipped ? h('button', { class: 'btn small', onclick: () => send({ type: 'equip', itemId: null, slot: i.type }) }, 'Unequip') : h('button', { class: 'btn small primary', onclick: () => send({ type: 'equip', itemId: i.id, slot: i.type }) }, 'Equip')));
    }
  }
  if (!inv.children.length) inv.append(h('p', { class: 'muted', text: 'Nothing here yet. Earn Coins in matches, then visit the shop.' }));
}

/* ───────── history ───────── */
function renderHistory(list) {
  const b = $('#histbody'); b.replaceChildren();
  if (!list.length) { b.append(h('p', { class: 'muted', text: 'No matches yet. Create a room and invite friends!' })); return; }
  b.append(h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Placement', 'Score', 'Coins', 'Players'].map((x, i) => h('th', { class: i > 1 ? 'num' : '', text: x })))),
    h('tbody', {}, list.map(m => h('tr', {}, h('td', { text: new Date(m.at).toLocaleString() }), h('td', { text: '#' + m.rank + (m.valid ? '' : ' (no Coins)') }), h('td', { class: 'num', text: m.score }), h('td', { class: 'num', text: m.coins }), h('td', { class: 'num', text: m.players }))))));
}

connect();
})();
