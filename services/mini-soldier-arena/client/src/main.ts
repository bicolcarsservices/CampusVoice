import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import { SERVER_URL, GAME_W, GAME_H, AUTO_QUICKPLAY } from './config';
import { Net } from './net';
import { initLobby, showLobby, hideLobby, loadName, explain } from './lobby';
import { runLoading } from './loading';
import { isTouchDevice, isFullscreen, isLandscape, goFullscreenLandscape } from './device';
import * as audio from './audio';
import { WEAPONS } from './shared/weapons';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { CONTROL_NAMES, loadControlLayout, saveControlLayout, defaultControlLayout } from './controls';
import type { ControlName, ControlLayout } from './controls';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const client = new Client(SERVER_URL);
let game: Phaser.Game | null = null;
let activeNet: Net | null = null;
let pendingGameStart: (() => void) | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const showToast = (message: string) => {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  window.setTimeout(() => { toast.style.display = 'none'; }, 2800);
};

function stopGame() {
  audio.jet(false);
  game?.destroy(true);
  game = null;
  activeNet = null;
}

function refreshGameControls() {
  const scene = game?.scene.getScene('GameScene') as GameScene | undefined;
  scene?.refreshControlLayout();
}

function renderControlPreview(layout: ControlLayout) {
  const preview = $('controlPreview');
  for (const name of CONTROL_NAMES) {
    const el = preview.querySelector<HTMLElement>(`[data-control="${name}"]`);
    if (!el) continue;
    const point = layout[name];
    el.style.left = `${point.x / GAME_W * 100}%`;
    el.style.top = `${point.y / GAME_H * 100}%`;
  }
}

let settingsLayout = loadControlLayout();
function initSettings() {
  const preview = $('controlPreview');
  const panel = $('settingsPanel');
  let dragging: { name: ControlName; pointerId: number } | null = null;
  const open = () => {
    settingsLayout = loadControlLayout();
    panel.style.display = 'flex';
    renderControlPreview(settingsLayout);
  };
  const close = () => {
    saveControlLayout(settingsLayout);
    panel.style.display = 'none';
    refreshGameControls();
  };
  for (const id of ['settings', 'roomSettings', 'controls']) $(id).onclick = open;
  $('closeSettings').onclick = close;
  $('resetSettings').onclick = () => {
    settingsLayout = defaultControlLayout();
    saveControlLayout(settingsLayout);
    renderControlPreview(settingsLayout);
    refreshGameControls();
  };
  preview.addEventListener('pointerdown', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-control]');
    const name = target?.dataset.control as ControlName | undefined;
    if (!target || !name || !CONTROL_NAMES.includes(name)) return;
    const rect = preview.getBoundingClientRect();
    const point = settingsLayout[name];
    const offsetX = point.x - (event.clientX - rect.left) / rect.width * GAME_W;
    const offsetY = point.y - (event.clientY - rect.top) / rect.height * GAME_H;
    dragging = { name, pointerId: event.pointerId };
    target.classList.add('dragging');
    target.setPointerCapture(event.pointerId);
    target.dataset.offsetX = String(offsetX);
    target.dataset.offsetY = String(offsetY);
    event.preventDefault();
  });
  preview.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const target = preview.querySelector<HTMLElement>(`[data-control="${dragging.name}"]`);
    if (!target) return;
    const rect = preview.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * GAME_W + Number(target.dataset.offsetX ?? 0);
    const y = (event.clientY - rect.top) / rect.height * GAME_H + Number(target.dataset.offsetY ?? 0);
    settingsLayout[dragging.name] = { x: Math.max(40, Math.min(GAME_W - 40, x)), y: Math.max(40, Math.min(GAME_H - 40, y)) };
    renderControlPreview(settingsLayout);
  });
  const stopDragging = (event: PointerEvent) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    preview.querySelector<HTMLElement>(`[data-control="${dragging.name}"]`)?.classList.remove('dragging');
    dragging = null;
    saveControlLayout(settingsLayout);
    refreshGameControls();
  };
  preview.addEventListener('pointerup', stopDragging);
  preview.addEventListener('pointercancel', stopDragging);
  window.addEventListener('resize', () => {
    if (panel.style.display === 'flex') renderControlPreview(settingsLayout);
  });
}

async function copyRoomCode() {
  const code = activeNet?.welcome?.code;
  if (!code || code === 'PUBLIC') {
    showToast('Create or join a Multiplayer room to copy its code.');
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    showToast(`Room code ${code} copied.`);
  } catch {
    const copied = window.prompt('Copy this room code:', code);
    if (copied !== null) showToast(`Room code ${code} ready to copy.`);
  }
}

async function shareRoomInvite() {
  const code = activeNet?.welcome?.code;
  if (!code || code === 'PUBLIC') {
    showToast('Create or join a Multiplayer room to share an invite.');
    return;
  }
  const link = new URL(window.location.href);
  link.searchParams.set('room', code);
  const invite = { title: 'Mini Soldier Arena', text: `Join my multiplayer match with code ${code}`, url: link.toString() };
  try {
    if (navigator.share) {
      await navigator.share(invite);
      showToast('Invite shared.');
    } else {
      await navigator.clipboard.writeText(link.toString());
      showToast('Invite link copied. Room code: ' + code);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    const copied = window.prompt(`Copy this invite link (room code: ${code}):`, link.toString());
    if (copied !== null) showToast('Invite link ready to copy.');
  }
}

// ---- sound button, full screen button ----
const muteBtn = $<HTMLButtonElement>('mute');
const syncMute = () => { muteBtn.textContent = audio.isMuted() ? 'Sound: Off' : 'Sound: On'; };
muteBtn.onclick = () => { audio.unlockAudio(); audio.setMuted(!audio.isMuted()); syncMute(); };
muteBtn.addEventListener('sync', syncMute);
syncMute();
const goFs = () => { void goFullscreenLandscape(); };
$('fs').onclick = goFs;
$('fshint').onclick = goFs;
$('rotateFull').onclick = goFs;
$('copyCode').onclick = () => { void copyRoomCode(); };
$('share').onclick = () => { void shareRoomInvite(); };
$('roomCopyCode').onclick = () => { void copyRoomCode(); };
$('roomInvite').onclick = () => { void shareRoomInvite(); };
initSettings();
const updateFsHint = () => document.body.classList.toggle('needfs', isTouchDevice() && !isFullscreen());
document.addEventListener('fullscreenchange', updateFsHint);

// First tap on a phone goes full screen + landscape; first touch or key also unlocks sound.
const firstGesture = () => {
  audio.unlockAudio();
  if (isTouchDevice() && (!isFullscreen() || !isLandscape())) goFs();
};
document.addEventListener('pointerup', firstGesture);
document.addEventListener('keydown', () => audio.unlockAudio());

function resumePendingGameStart() {
  if (!pendingGameStart || (isTouchDevice() && !isLandscape())) return;
  const resume = pendingGameStart;
  pendingGameStart = null;
  $('rotate').classList.remove('active');
  resume();
}
window.addEventListener('orientationchange', resumePendingGameStart);
window.addEventListener('resize', resumePendingGameStart);

function startGame(room: Room, net: Net) {
  if (isTouchDevice() && !isLandscape()) {
    pendingGameStart = () => startGame(room, net);
    $('rotate').classList.add('active');
    void goFullscreenLandscape();
    return;
  }
  pendingGameStart = null;
  $('rotate').classList.remove('active');
  $('roomLobby').style.display = 'none';
  $('settingsPanel').style.display = 'none';
  const hasPrivateCode = !!net.welcome?.code && net.welcome.code !== 'PUBLIC';
  $('copyCode').style.display = hasPrivateCode ? 'inline-block' : 'none';
  $('share').style.display = hasPrivateCode ? 'inline-block' : 'none';
  hideLobby();
  updateFsHint();
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#0b1a10',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3 },
    scene: [BootScene, GameScene],
    callbacks: { preBoot: (g) => { g.registry.set('net', net); } },
  });
}

function renderRoomLobby(net: Net) {
  const state = net.roomState;
  const welcome = net.welcome;
  const roster = state?.players ?? net.roster;
  const hostId = state?.hostId ?? welcome?.hostId ?? '';
  const isHost = welcome?.id === hostId;
  $('roomCodeDisplay').textContent = state?.code ?? welcome?.code ?? '...';
  $('roomStatus').textContent = isHost
    ? (roster.length < 2 ? 'Invite at least one more player, then start the match.' : `${roster.length}/${state?.maxPlayers ?? welcome?.maxPlayers ?? 0} players — ready to start.`)
    : 'Waiting for the host to start the match...';
  $('roomPlayers').replaceChildren(...roster.map((player) => {
    const item = document.createElement('li');
    item.textContent = `${player.name}${player.id === hostId ? ' — Host' : ''}`;
    return item;
  }));
  const start = $<HTMLButtonElement>('roomStart');
  start.style.display = isHost ? 'block' : 'none';
  start.disabled = roster.length < 2;
}

function enter(room: Room, privateRoom = false) {
  const net = new Net(room);
  activeNet = net;
  const token = room.reconnectionToken;
  let leftOnPurpose = false;
  const leaveRoom = () => { leftOnPurpose = true; void room.leave(); };
  net.onSeriesComplete = leaveRoom;
  $('roomLeave').onclick = leaveRoom;
  $<HTMLButtonElement>('leave').onclick = leaveRoom;

  room.onLeave(async (code: number) => {
    pendingGameStart = null;
    $('rotate').classList.remove('active');
    stopGame();
    if (leftOnPurpose || code === 1000) { showLobby(); return; }
    if (code === 4002) { showLobby('Disconnected: too many messages sent.'); return; }
    // unexpected disconnect: try to get back into the same room
    for (let i = 0; i < 3; i++) {
      try {
        const back = await client.reconnect(token);
        enter(back, privateRoom);
        return;
      } catch {
        await sleep(1500);
      }
    }
    showLobby('Lost connection to the server.');
  });

  if (privateRoom) {
    hideLobby();
    $('roomLobby').style.display = 'flex';
    document.body.classList.remove('ingame');
    $('roomStart').onclick = () => {
      if (isTouchDevice() && (!isFullscreen() || !isLandscape())) void goFullscreenLandscape();
      room.send('start');
    };
    net.onRoomState = () => renderRoomLobby(net);
    net.onRoomStart = () => startGame(room, net);
    net.onWelcome = () => {
      if (net.welcome?.phase !== 'lobby') startGame(room, net);
      else renderRoomLobby(net);
    };
    renderRoomLobby(net);
    if (net.welcome && net.welcome.phase !== 'lobby') startGame(room, net);
    return;
  }
  startGame(room, net);
}

initLobby(client, (room, privateRoom) => enter(room, privateRoom));

// ---- start-up: title picture with a loading bar, then straight into a match ----
async function boot() {
  const fill = $('fill'), pct = $('pct'), msg = $('loadmsg'), splash = $('splash');
  const files = ['assets/soldier.png', 'assets/head.png', ...[...Object.keys(WEAPONS), 'grenade', 'pineapple'].map((k) => `assets/weapons/${k}.png`)];
  await runLoading(files, (p) => { fill.style.width = `${Math.round(p * 100)}%`; pct.textContent = `${Math.round(p * 100)}%`; });

  const inviteCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() ?? '';
  if (/^[A-Z0-9]{4,8}$/.test(inviteCode)) {
    msg.textContent = `Joining room ${inviteCode}...`;
    try {
      const name = loadName() || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
      enter(await client.join('arena', { code: inviteCode, name }), inviteCode !== 'PUBLIC');
    } catch (e) {
      showLobby(explain(e));
      ($('code') as HTMLInputElement).value = inviteCode;
    }
  } else if (AUTO_QUICKPLAY) {
    msg.textContent = 'Joining a match...';
    try {
      const name = loadName() || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
      enter(await client.joinOrCreate('arena', { code: 'PUBLIC', name }));
    } catch (e) {
      showLobby(explain(e));
    }
  } else showLobby();
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 800);
}
void boot();
