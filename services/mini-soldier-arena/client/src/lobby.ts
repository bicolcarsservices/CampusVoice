import type { Client, Room } from 'colyseus.js';
import { SERVER_URL } from './config';
import { MAPS, MAP_IDS } from './shared/maps';
import { ROUND_CHOICES, TARGET_CHOICES, MAX_PLAYERS, MIN_PLAYERS, Mode } from './shared/rules';
import { goFullscreenLandscape, isFullscreen, isLandscape, isTouchDevice } from './device';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export function loadName(): string {
  try { return localStorage.getItem('msa-name') ?? ''; } catch { return ''; }
}
function saveName(n: string) {
  try { localStorage.setItem('msa-name', n); } catch { /* storage may be blocked */ }
}

export function showLobby(message = '') {
  $('roomLobby').style.display = 'none';
  $('settingsPanel').style.display = 'none';
  $('lobby').style.display = 'flex';
  document.body.classList.remove('ingame');
  $('msg').textContent = message;
  setBusy(false);
}
export function hideLobby() {
  $('lobby').style.display = 'none';
  $('roomLobby').style.display = 'none';
  document.body.classList.add('ingame');
}
function setBusy(busy: boolean) {
  ['quick', 'create', 'join'].forEach((id) => { ($(id) as HTMLButtonElement).disabled = busy; });
}

export function explain(e: unknown): string {
  if (typeof ProgressEvent !== 'undefined' && e instanceof ProgressEvent) {
    return `Could not reach the multiplayer server at ${SERVER_URL}. Check that the server is running, then try again.`;
  }
  const raw = e instanceof Error ? e.message : String(e);
  return /no rooms|not found|locked|full/i.test(raw) ? 'Room not found or full.' : `Could not connect (${raw}). Is the server running?`;
}

export function initLobby(client: Client, onJoined: (room: Room, privateRoom: boolean) => void) {
  $('srv').textContent = `Server: ${SERVER_URL}`;
  const opt = (v: string | number, text: string, sel = false) => `<option value="${v}"${sel ? ' selected' : ''}>${text}</option>`;

  $<HTMLSelectElement>('mode').innerHTML = opt('ffa', 'Everyone vs everyone', true) + opt('teams', 'Teams (5 vs 5)');
  $<HTMLSelectElement>('rounds').innerHTML = ROUND_CHOICES.map((n) => opt(n, `${n} round${n > 1 ? 's' : ''}`, n === 3)).join('');
  $<HTMLSelectElement>('target').innerHTML = TARGET_CHOICES.map((n) => opt(n, `${n} kills`, n === 10)).join('');
  $<HTMLSelectElement>('map').innerHTML = opt('random', 'Random (new map every round)', true) + MAP_IDS.map((id) => opt(id, MAPS[id].name)).join('');
  const fillPlayers = () => {
    const mode = $<HTMLSelectElement>('mode').value as Mode;
    const cap = MAX_PLAYERS[mode];
    const list = [];
    for (let n = MIN_PLAYERS; n <= cap; n++) list.push(opt(n, `${n} players`, n === cap));
    $<HTMLSelectElement>('max').innerHTML = list.join('');
  };
  $('mode').onchange = fillPlayers;
  fillPlayers();

  const nameInput = $<HTMLInputElement>('name');
  nameInput.value = loadName();

  const run = async (fn: (name: string) => Promise<Room>, privateRoom = false) => {
    if (isTouchDevice() && (!isFullscreen() || !isLandscape())) void goFullscreenLandscape();
    const name = nameInput.value.trim().slice(0, 14);
    saveName(name);
    $('msg').textContent = 'Connecting...';
    setBusy(true);
    try { onJoined(await fn(name), privateRoom); } catch (e) { showLobby(explain(e)); }
  };

  $('quick').onclick = () => run((name) => client.joinOrCreate('arena', {
    code: 'PUBLIC',
    name,
    mode: $<HTMLSelectElement>('mode').value,
    maxPlayers: Number($<HTMLSelectElement>('max').value),
    rounds: Number($<HTMLSelectElement>('rounds').value),
    target: Number($<HTMLSelectElement>('target').value),
    map: $<HTMLSelectElement>('map').value,
  }));
  $('create').onclick = () => run((name) => client.create('arena', {
    code: randomCode(), name,
    mode: $<HTMLSelectElement>('mode').value,
    maxPlayers: Number($<HTMLSelectElement>('max').value),
    rounds: Number($<HTMLSelectElement>('rounds').value),
    target: Number($<HTMLSelectElement>('target').value),
    map: $<HTMLSelectElement>('map').value,
  }), true);
  $('join').onclick = () => {
    const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
    if (code.length < 4) { $('msg').textContent = 'Enter the room code first.'; return; }
    void run((name) => client.join('arena', { code, name }), code !== 'PUBLIC');
  };
}
