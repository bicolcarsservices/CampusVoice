import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import { SERVER_URL, GAME_W, GAME_H, AUTO_QUICKPLAY } from './config';
import { Net } from './net';
import { RoomChat, TeamVoice } from './communications';
import { initLobby, showLobby, showWaitingRoom, hideLobby, loadName, explain } from './lobby';
import { runLoading } from './loading';
import { isTouchDevice, isFullscreen, isLandscape, goFullscreenLandscape } from './device';
import * as audio from './audio';
import { WEAPONS } from './shared/weapons';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { ACTION_IDS, ACTION_LABELS, ActionId, getControlSettings, resetControlSettings, updateControlSettings, updateKeyBinding } from './controls';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const client = new Client(SERVER_URL);
let game: Phaser.Game | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const controlScene = () => game?.scene.getScene('GameScene') as GameScene | undefined;

function stopGame() {
  audio.jet(false);
  game?.destroy(true);
  game = null;
  document.body.classList.remove('editing-controls');
  document.getElementById('controlSettings')?.classList.remove('open');
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
const updateFsHint = () => document.body.classList.toggle('needfs', isTouchDevice() && !isFullscreen());
document.addEventListener('fullscreenchange', updateFsHint);

const settingsPanel = $('controlSettings');
const keyBindings = $('keyBindings');
let waitingForKey: ActionId | null = null;
function refreshSettingsPanel() {
  const settings = getControlSettings();
  $<HTMLInputElement>('controlSize').value = String(settings.size);
  $<HTMLInputElement>('controlOpacity').value = String(settings.opacity);
  keyBindings.replaceChildren();
  for (const action of ACTION_IDS) {
    const row = document.createElement('div');
    row.className = 'keyBinding';
    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[action];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = settings.keys[action];
    button.setAttribute('aria-label', `Change ${ACTION_LABELS[action]} key`);
    button.onclick = () => {
      waitingForKey = action;
      button.textContent = 'Press key';
      button.focus();
    };
    row.append(label, button);
    keyBindings.append(row);
  }
}
function closeSettings() {
  settingsPanel.classList.remove('open');
  waitingForKey = null;
  controlScene()?.refreshControls();
}
$<HTMLButtonElement>('settings').onclick = () => {
  refreshSettingsPanel();
  settingsPanel.classList.add('open');
};
$<HTMLButtonElement>('closeSettings').onclick = closeSettings;
settingsPanel.addEventListener('pointerdown', (event) => {
  if (event.target === settingsPanel) closeSettings();
});
$<HTMLInputElement>('controlSize').oninput = (event) => {
  updateControlSettings({ size: Number((event.currentTarget as HTMLInputElement).value) });
};
$<HTMLInputElement>('controlOpacity').oninput = (event) => {
  updateControlSettings({ opacity: Number((event.currentTarget as HTMLInputElement).value) });
};
document.addEventListener('keydown', (event) => {
  if (!waitingForKey) return;
  const key = event.key === ' ' ? 'SPACE' : event.key.startsWith('Arrow') ? event.key.toUpperCase() : event.key.toUpperCase();
  if (!/^(?:[A-Z0-9]|SPACE|ARROWLEFT|ARROWRIGHT|ARROWUP|ARROWDOWN)$/.test(key)) return;
  event.preventDefault();
  event.stopPropagation();
  updateKeyBinding(waitingForKey, key);
  waitingForKey = null;
  refreshSettingsPanel();
  controlScene()?.refreshControls();
});
$<HTMLButtonElement>('resetControls').onclick = () => {
  resetControlSettings();
  refreshSettingsPanel();
  controlScene()?.refreshControls();
};
$<HTMLButtonElement>('arrangeControls').onclick = () => {
  closeSettings();
  document.body.classList.add('editing-controls');
  controlScene()?.setLayoutEditing(true);
};
$<HTMLButtonElement>('finishLayout').onclick = () => {
  document.body.classList.remove('editing-controls');
  controlScene()?.setLayoutEditing(false);
};

// First tap on a phone goes full screen + landscape; first touch or key also unlocks sound.
const firstGesture = () => {
  audio.unlockAudio();
  if (document.body.classList.contains('ingame') && isTouchDevice() && (!isFullscreen() || !isLandscape())) goFs();
};
document.addEventListener('pointerup', firstGesture);
document.addEventListener('keydown', () => audio.unlockAudio());

function enter(room: Room, waitForPlayers = false) {
  const net = new Net(room);
  new RoomChat(room);
  new TeamVoice(room);
  const token = room.reconnectionToken;
  let leftOnPurpose = false;
  let roomLeft = false;
  let loading = false;
  let loadId = 0;

  $<HTMLButtonElement>('leave').onclick = () => { leftOnPurpose = true; void room.leave(); };

  room.onLeave(async (code: number) => {
    const wasInMatch = document.body.classList.contains('ingame');
    roomLeft = true;
    loadId++;
    document.body.classList.remove('chat-open');
    $('chatToggle').setAttribute('aria-expanded', 'false');
    $('chatToggle').setAttribute('aria-label', 'Open chat');
    $('voiceStatus').setAttribute('hidden', '');
    stopGame();
    if (leftOnPurpose || (code === 1000 && !wasInMatch)) { $('matchLoading').classList.remove('active'); showLobby(); return; }
    if (code === 4002) { $('matchLoading').classList.remove('active'); showLobby('Disconnected: too many messages sent.'); return; }
    if (wasInMatch) {
      $('matchLoadingTitle').textContent = 'Reconnecting to match...';
      $('matchMessage').textContent = 'Your connection dropped. Restoring your match...';
      $('matchFill').style.width = '100%';
      $('matchPct').textContent = '';
      $('matchLoading').classList.add('active');
    }
    // unexpected disconnect: try to get back into the same room
    for (let i = 0; i < 40; i++) {
      try {
        const back = await client.reconnect(token);
        enter(back, waitForPlayers);
        return;
      } catch {
        await sleep(1500);
      }
    }
    $('matchLoading').classList.remove('active');
    showLobby('Lost connection to the server.');
  });

  const startMatch = async () => {
    if (loading || roomLeft) return;
    loading = true;
    const currentLoad = ++loadId;
    const isQuickPlay = net.welcome?.code === 'PUBLIC';
    const title = isQuickPlay ? 'Quick Play' : 'Loading multiplayer match...';
    $('matchLoadingTitle').textContent = title;
    $('matchMessage').textContent = isQuickPlay && !net.started
      ? 'Naghahanap ng mga manlalaro...'
      : 'Spawning into the match...';
    $('matchLoading').classList.add('active');
    $('matchFill').style.width = '100%';
    $('matchPct').textContent = '100%';
    try {
      if (currentLoad !== loadId || roomLeft) return;
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
        callbacks: {
          preBoot: (g) => {
            g.registry.set('net', net);
            g.registry.set('onArenaReady', () => {
              if (currentLoad === loadId && !roomLeft) $('matchLoading').classList.remove('active');
            });
          },
        },
      });
    } catch (error) {
      $('matchLoading').classList.remove('active');
      showLobby(explain(error));
    }
  };

  if (waitForPlayers) {
    const renderWaiting = () => showWaitingRoom(
      net.welcome?.code ?? '',
      net.lobby,
      net.welcome?.mode ?? 'teams',
      () => { leftOnPurpose = true; void room.leave(); },
    );
    net.onWelcome = () => {
      renderWaiting();
      if (net.started) void startMatch();
      else $('matchLoading').classList.remove('active');
    };
    net.onLobby = (state) => {
      renderWaiting();
      if (state.started) void startMatch();
    };
    net.onStart = () => { void startMatch(); };
    renderWaiting();
    if (net.started) void startMatch();
  } else {
    const updateQuickPlayStatus = () => {
      if (net.welcome?.code !== 'PUBLIC') return;
      $('matchLoadingTitle').textContent = 'Quick Play';
      $('matchMessage').textContent = net.started
        ? 'Spawning into the match...'
        : 'Naghahanap ng mga manlalaro...';
    };
    net.onWelcome = updateQuickPlayStatus;
    net.onStart = updateQuickPlayStatus;
    updateQuickPlayStatus();
    void startMatch();
  }
}

initLobby(client, enter);

$<HTMLButtonElement>('chatToggle').onclick = () => {
  const open = document.body.classList.toggle('chat-open');
  $('chatToggle').setAttribute('aria-expanded', String(open));
  $('chatToggle').setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
};

// ---- start-up: title picture with a loading bar, then straight into a match ----
async function boot() {
  const fill = $('fill'), pct = $('pct'), msg = $('loadmsg'), splash = $('splash');
  const files = ['assets/soldier.png', 'assets/head.png', ...[...Object.keys(WEAPONS), 'grenade', 'pineapple'].map((k) => `assets/weapons/${k}.png`)];
  await runLoading(files, (p) => { fill.style.width = `${Math.round(p * 100)}%`; pct.textContent = `${Math.round(p * 100)}%`; });

  if (AUTO_QUICKPLAY) {
    msg.textContent = 'Joining a match...';
    try {
      const name = loadName() || `Soldier${Math.floor(Math.random() * 900 + 100)}`;
      enter(await client.joinOrCreate('arena', { code: 'PUBLIC', name }));
    } catch (e) {
      showLobby(explain(e));
    }
  } else {
    showLobby();
    const inviteCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
    if (inviteCode) {
      if (/^[A-Z0-9]{4,8}$/.test(inviteCode)) {
        $<HTMLInputElement>('code').value = inviteCode;
        $<HTMLButtonElement>('join').click();
      } else {
        $('msg').textContent = 'This room link has an invalid code.';
      }
    }
  }
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 800);
}
void boot();
