import type { Room } from 'colyseus.js';
import type { Mode } from './shared/rules';

interface PlayerInfo { id: string; name: string; team: number }
interface ChatMessage { id: string; name: string; text: string; at: number }
interface SignalMessage {
  from: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class RoomChat {
  private logs = Array.from(document.querySelectorAll<HTMLOListElement>('[data-chat-log]'));
  private formCleanups: (() => void)[] = [];

  constructor(private room: Room) {
    this.logs.forEach((log) => log.replaceChildren());
    document.querySelectorAll<HTMLFormElement>('[data-chat-form]').forEach((form) => {
      const input = form.querySelector<HTMLInputElement>('[data-chat-input]')!;
      const submit = (event: SubmitEvent) => {
        event.preventDefault();
        const text = input.value.trim().slice(0, 240);
        if (!text) return;
        room.send('chat-send', { text });
        input.value = '';
      };
      form.addEventListener('submit', submit);
      this.formCleanups.push(() => form.removeEventListener('submit', submit));
    });
    room.onMessage('chat-history', (messages: ChatMessage[]) => {
      this.logs.forEach((log) => log.replaceChildren());
      messages.forEach((message) => this.append(message));
    });
    room.onMessage('chat', (message: ChatMessage) => this.append(message));
    room.onMessage('chat-error', (message: { message: string }) => {
      this.append({ id: '', name: 'SYSTEM', text: message.message, at: Date.now() });
    });
    room.onLeave(() => this.destroy());
  }

  destroy() {
    this.formCleanups.forEach((cleanup) => cleanup());
    this.formCleanups = [];
  }

  private append(message: ChatMessage) {
    this.logs.forEach((log) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = message.id ? 'chatName' : 'chatName system';
      name.textContent = `${message.name}: `;
      const text = document.createElement('span');
      text.textContent = message.text;
      item.append(name, text);
      log.append(item);
      while (log.children.length > 50) log.firstElementChild?.remove();
      log.scrollTop = log.scrollHeight;
    });
  }
}

interface PeerState {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswerPending: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

export class TeamVoice {
  private players = new Map<string, PlayerInfo>();
  private peers = new Map<string, PeerState>();
  private mode: Mode = 'ffa';
  private team = -1;
  private started = false;
  private micOn = false;
  private stream: MediaStream | null = null;
  private statusTimer = 0;

  constructor(private room: Room) {
    const button = $<HTMLButtonElement>('voiceToggle');
    button.onclick = () => { void this.toggleMic(); };
    room.onMessage('welcome', (message: {
      mode: Mode; started?: boolean; players?: PlayerInfo[];
    }) => {
      this.mode = message.mode;
      this.updatePlayers(message.players ?? []);
      if (message.started) this.setStarted();
      this.updateButton();
    });
    room.onMessage('roster', (message: { players: PlayerInfo[] }) => {
      this.updatePlayers(message.players);
    });
    room.onMessage('start', () => this.setStarted());
    room.onMessage('rtc-signal', (message: SignalMessage) => { void this.handleSignal(message); });
    room.onMessage('rtc-error', (message: { message: string }) => this.setStatus(message.message, true));
    room.onLeave(() => this.destroy());
    this.updateButton();
  }

  private updatePlayers(players: PlayerInfo[]) {
    this.players = new Map(players.map((player) => [player.id, player]));
    this.team = this.players.get(this.room.sessionId)?.team ?? -1;
    this.updateButton();
    this.syncPeers();
  }

  private setStarted() {
    this.started = true;
    this.updateButton();
    this.syncPeers();
  }

  private updateButton() {
    const button = $<HTMLButtonElement>('voiceToggle');
    const hasTeammates = [...this.players.values()].some((player) => player.team === this.team && player.id !== this.room.sessionId);
    const available = this.started && this.mode === 'teams' && this.team >= 0 && hasTeammates &&
      typeof RTCPeerConnection !== 'undefined';
    button.disabled = !available;
    button.textContent = 'Mic';
    button.setAttribute('aria-pressed', String(this.micOn));
    button.setAttribute('aria-label', available
      ? (this.micOn ? 'Turn microphone off' : 'Turn microphone on')
      : (this.started && this.mode === 'teams' && !hasTeammates ? 'No teammates available' : 'Team voice unavailable'));
    button.title = available ? 'Toggle team voice chat'
      : (this.started && this.mode === 'teams' && !hasTeammates ? 'No teammates are in your team'
        : 'Team voice is available in team matches');
  }

  private setStatus(message: string, persistent = false) {
    const element = $<HTMLDivElement>('voiceStatus');
    element.textContent = message;
    element.hidden = false;
    window.clearTimeout(this.statusTimer);
    if (!persistent) {
      this.statusTimer = window.setTimeout(() => { element.hidden = true; }, 5000);
    }
  }

  private async toggleMic() {
    if (this.micOn) {
      this.micOn = false;
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      this.updateButton();
      this.setStatus('Mic muted. Team voice is still connected.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus('Microphone access needs a secure HTTPS connection and a supported browser.', true);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      this.micOn = true;
      this.syncPeers();
      try {
        await Promise.all([...this.peers.values()].map((peer) => this.attachLocalAudio(peer)));
      } catch (error) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        throw error;
      }
      this.updateButton();
      this.setStatus('Mic on. Only your teammates can hear you.', true);
    } catch (error) {
      this.micOn = false;
      this.updateButton();
      this.setStatus(`Could not access the microphone: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private syncPeers() {
    if (!this.started || this.mode !== 'teams' || this.team < 0) return;
    if (typeof RTCPeerConnection === 'undefined') {
      this.setStatus('Voice chat is not supported in this browser.', true);
      return;
    }
    const teammates = [...this.players.values()].filter((player) => player.team === this.team && player.id !== this.room.sessionId);
    if (!teammates.length) {
      this.peers.forEach((peer) => peer.pc.close());
      this.peers.clear();
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      this.micOn = false;
      this.updateButton();
      return;
    }
    const ids = new Set(teammates.map((player) => player.id));
    this.peers.forEach((peer, id) => {
      if (!ids.has(id)) {
        peer.pc.close();
        if (peer.audio) {
          peer.audio.pause();
          peer.audio.srcObject = null;
        }
        this.peers.delete(id);
      }
    });
    if (this.micOn) teammates.forEach((player) => this.createPeer(player.id));
  }

  private createPeer(id: string, initiate = true): PeerState {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const peer: PeerState = {
      pc,
      audio: null,
      polite: this.room.sessionId > id,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswerPending: false,
      pendingCandidates: [],
    };
    this.peers.set(id, peer);
    if (initiate) pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.onicecandidate = (event) => {
      if (event.candidate) this.room.send('rtc-signal', { to: id, candidate: event.candidate.toJSON() });
    };
    pc.onnegotiationneeded = () => { void this.negotiate(id, peer); };
    pc.ontrack = (event) => {
      const audio = peer.audio ?? new Audio();
      peer.audio = audio;
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch((error: unknown) => {
        this.setStatus(`Allow audio playback to hear your teammates: ${String(error)}`, true);
      });
    };
    if (this.stream) void this.attachLocalAudio(peer);
    return peer;
  }

  private async attachLocalAudio(peer: PeerState) {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return;
    const transceiver = peer.pc.getTransceivers().find((item) => item.receiver.track.kind === 'audio');
    if (transceiver) {
      transceiver.direction = 'sendrecv';
      await transceiver.sender.replaceTrack(track);
    }
  }

  private async negotiate(id: string, peer: PeerState) {
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      if (peer.pc.localDescription) {
        this.room.send('rtc-signal', { to: id, description: peer.pc.localDescription.toJSON() });
      }
    } catch (error) {
      if (peer.pc.signalingState !== 'closed') this.setStatus(`Voice connection setup failed: ${String(error)}`, true);
    } finally {
      peer.makingOffer = false;
    }
  }

  private async handleSignal(message: SignalMessage) {
    const player = this.players.get(message.from);
    if (!player || player.team !== this.team || player.id === this.room.sessionId) return;
    const peer = this.createPeer(message.from, message.description?.type !== 'offer');
    try {
      if (message.description) {
        const description = message.description;
        const readyForOffer = !peer.makingOffer &&
          (peer.pc.signalingState === 'stable' || peer.settingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        peer.settingRemoteAnswerPending = description.type === 'answer';
        await peer.pc.setRemoteDescription(description);
        peer.settingRemoteAnswerPending = false;
        for (const candidate of peer.pendingCandidates.splice(0)) await peer.pc.addIceCandidate(candidate);
        if (description.type === 'offer') {
          if (this.stream) await this.attachLocalAudio(peer);
          await peer.pc.setLocalDescription();
          if (peer.pc.localDescription) {
            this.room.send('rtc-signal', { to: message.from, description: peer.pc.localDescription.toJSON() });
          }
        }
      } else if (message.candidate) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.candidate);
        else peer.pendingCandidates.push(message.candidate);
      }
    } catch (error) {
      if (!peer.ignoreOffer) this.setStatus(`Voice connection error: ${String(error)}`, true);
    }
  }

  private destroy() {
    this.peers.forEach((peer) => peer.pc.close());
    this.peers.forEach((peer) => {
      if (peer.audio) {
        peer.audio.pause();
        peer.audio.srcObject = null;
      }
    });
    this.peers.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.micOn = false;
    window.clearTimeout(this.statusTimer);
  }
}
