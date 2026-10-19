import type { Client, Room } from 'colyseus.js';
import { SERVER_URL } from './config';
import { MAPS, MAP_IDS } from './shared/maps';
import { ROUND_CHOICES, TARGET_CHOICES, MAX_PLAYERS, MIN_PLAYERS, Mode } from './shared/rules';

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
  $('lobby').style.display = 'flex';
  $('menu').style.display = 'block';
  $('waiting').style.display = 'none';
  $('lobbyPanel').classList.remove('waiting-mode');
  $('waiting').classList.remove('room-chat-open');
  $('lobbyChatToggle').setAttribute('aria-expanded', 'false');
  $('lobbyChatToggle').setAttribute('aria-label', 'Open room chat');
  $('lobbyChatToggle').textContent = 'Chat';
  document.body.classList.remove('ingame');
  document.body.classList.remove('room-waiting');
  $('msg').textContent = message;
  setBusy(false);
}
export function hideLobby() {
  $('lobby').style.display = 'none';
  $('waiting').classList.remove('room-chat-open');
  $('lobbyChatToggle').setAttribute('aria-expanded', 'false');
  $('lobbyChatToggle').setAttribute('aria-label', 'Open room chat');
  $('lobbyChatToggle').textContent = 'Chat';
  document.body.classList.add('ingame');
}
function setBusy(busy: boolean) {
  ['quick', 'create', 'join'].forEach((id) => { ($(id) as HTMLButtonElement).disabled = busy; });
}

export function explain(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return /no rooms|not found|locked|full/i.test(raw) ? 'Room not found or full.' : `Could not connect (${raw}). Is the server running?`;
}

export interface WaitingPlayer { name: string; team: number }
export interface WaitingState { players: WaitingPlayer[]; count: number; maxPlayers: number }

export function showWaitingRoom(
  code: string,
  state: WaitingState | null,
  mode: Mode,
  onCancel: () => void,
) {
  $('lobby').style.display = 'flex';
  $('menu').style.display = 'none';
  $('waiting').style.display = 'block';
  $('lobbyPanel').classList.add('waiting-mode');
  document.body.classList.remove('ingame');
  document.body.classList.add('room-waiting');
  const isQuickPlay = code === 'PUBLIC';
  $('waitingTitle').textContent = isQuickPlay ? 'Quick Play' : 'Multiplayer Lobby';
  $('waitingHint').textContent = isQuickPlay
    ? 'Naghahanap ng mga manlalaro para sa 5v5 match.'
    : 'I-share ang code at hintaying makumpleto ang mga manlalaro.';
  $('roomCode').textContent = isQuickPlay ? '' : (code || '...');
  $('roomCode').style.display = isQuickPlay ? 'none' : 'block';
  $('copyCode').style.display = isQuickPlay ? 'none' : 'block';
  $('shareRoom').style.display = isQuickPlay ? 'none' : 'block';
  $('roomCount').textContent = state
    ? `${state.count}/${state.maxPlayers} players`
    : 'Connecting to lobby...';

  const players = state?.players ?? [];
  const maxPlayers = state?.maxPlayers ?? 10;
  const makeSlot = (name?: string) => {
    const slot = document.createElement('div');
    slot.className = `playerSlot${name ? '' : ' empty'}`;
    const avatar = document.createElement('span');
    avatar.className = 'playerAvatar';
    if (name) {
      const image = document.createElement('img');
      image.src = '/assets/head.png';
      image.alt = '';
      avatar.append(image);
    } else avatar.textContent = '+';
    const label = document.createElement('span');
    label.className = 'playerName';
    label.textContent = name ?? 'Waiting for player...';
    slot.append(avatar, label);
    return slot;
  };
  const fillSlots = (section: HTMLElement, roster: WaitingPlayer[], capacity: number) => {
    const slots = section.querySelector<HTMLElement>('.teamSlots')!;
    slots.replaceChildren(...Array.from({ length: capacity }, (_, i) => makeSlot(roster[i]?.name)));
    section.querySelector<HTMLElement>('.teamCount')!.textContent = `${roster.length}/${capacity}`;
  };

  const teams = $('teamBattle');
  const ffa = $('ffaRoster');
  if (mode === 'teams') {
    teams.style.display = 'grid';
    ffa.style.display = 'none';
    const blue = players.filter((player) => player.team === 0);
    const red = players.filter((player) => player.team === 1);
    const blueCapacity = Math.ceil(maxPlayers / 2);
    const redCapacity = Math.floor(maxPlayers / 2);
    fillSlots($('blueTeam'), blue, blueCapacity);
    fillSlots($('redTeam'), red, redCapacity);
  } else {
    teams.style.display = 'none';
    ffa.style.display = 'block';
    fillSlots(ffa, players, maxPlayers);
  }

  $('roomStatus').textContent = state
    ? (isQuickPlay
      ? 'Naghihintay ng mga manlalaro. Magsisimula kapag nabuo na ang match.'
      : 'Naghihintay ng kakampi at kalaban...')
    : 'Connecting to lobby...';
  $('cancelRoom').textContent = isQuickPlay ? 'Cancel search' : 'Leave lobby';
  $('cancelRoom').onclick = onCancel;
  $('lobbyChatToggle').onclick = () => {
    const open = $('waiting').classList.toggle('room-chat-open');
    $('lobbyChatToggle').setAttribute('aria-expanded', String(open));
    $('lobbyChatToggle').setAttribute('aria-label', open ? 'Close room chat' : 'Open room chat');
    $('lobbyChatToggle').textContent = open ? 'Close' : 'Chat';
  };
  $('copyCode').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      $('roomStatus').textContent = 'Room code copied. Ibahagi ito sa mga kalaro.';
    } catch (error) {
      $('roomStatus').textContent = `Hindi makopya ang code. Piliin at kopyahin ito nang mano-mano. (${String(error)})`;
    }
  };
  $('shareRoom').onclick = async () => {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', code);
    const shareData = {
      title: 'Join my Mini Soldier Arena room',
      text: `Join my Mini Soldier Arena room with code ${code}.`,
      url: inviteUrl.toString(),
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        $('roomStatus').textContent = 'Room link shared.';
      } else {
        await navigator.clipboard.writeText(shareData.url);
        $('roomStatus').textContent = 'Room link copied. Ibahagi ito sa mga kalaro.';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      $('roomStatus').textContent = `Hindi maibahagi ang link. (${String(error)})`;
    }
  };
}

export function initLobby(client: Client, onJoined: (room: Room, waitForPlayers: boolean) => void) {
  $('srv').textContent = `Server: ${SERVER_URL}`;
  const opt = (v: string | number, text: string, sel = false) => `<option value="${v}"${sel ? ' selected' : ''}>${text}</option>`;

  $<HTMLSelectElement>('mode').innerHTML = opt('ffa', 'Everyone vs everyone') + opt('teams', 'Teams (5 vs 5)', true);
  $<HTMLSelectElement>('rounds').innerHTML = ROUND_CHOICES.map((n) => opt(n, `${n} round${n > 1 ? 's' : ''}`, n === 7)).join('');
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

  const run = async (fn: (name: string) => Promise<Room>, waitForPlayers: boolean) => {
    const name = nameInput.value.trim().slice(0, 14);
    saveName(name);
    $('msg').textContent = waitForPlayers ? 'Searching for players...' : 'Connecting...';
    setBusy(true);
    try { onJoined(await fn(name), waitForPlayers); } catch (e) { showLobby(explain(e)); }
  };

  $('quick').onclick = () => run((name) => client.joinOrCreate('arena', {
    code: 'PUBLIC', name, mode: 'teams', maxPlayers: 10, rounds: 7, target: 10, map: 'random',
  }), true);
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
    void run((name) => client.join('arena', { code, name }), true);
  };
}
