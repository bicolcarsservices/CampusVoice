import Phaser from 'phaser';
import { Body, InputCmd, FIXED_DT, SPEED, Rect, stepBody, outOfBounds, segHit } from '../shared/sim';
import { MapDef, getMap } from '../shared/maps';
import { WEAPONS, BOMBS, WeaponKey, MAX_SLOTS, isWeapon } from '../shared/weapons';
import { TEAM_COLORS, TEAM_TEXT, TEAM_NAMES } from '../shared/rules';
import { GAME_W as W, GAME_H as H, CELL_H, FEET, JOY_R, INTERP_DELAY_MS } from '../config';
import { buildWorld, updateBackdrop, World } from '../world';
import { Net, Snap, SnapPlayer, GameEvent } from '../net';
import * as audio from '../audio';

interface Sample extends SnapPlayer { at: number }
interface View {
  sprite: Phaser.GameObjects.Sprite; gun: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text;
  buf: Sample[]; lastX: number; lastY: number; lastHp: number; hurtUntil: number; wasDead: boolean; lastJet: number; facing: number;
}
interface VBullet { img: Phaser.GameObjects.Image; vx: number; vy: number; ttl: number; rocket: boolean }
interface ItemObj { type: string; img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse; spark: Phaser.GameObjects.Image; tx: number; ty: number }
interface EndInfo { n: number; rounds: number; series: boolean; champion: string; winnerName: string; scores: { name: string; k: number; d: number; w: number; t: number }[]; tw: number[]; next: number }

const TEXT: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 };
const feetToCenter = (y: number) => y + CELL_H / 2 - FEET;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const BTN_BOMB = { x: W - 110, y: H - 170, r: 44 };
const BTN_RELOAD = { x: W - 215, y: H - 120, r: 34 };
const BTN_PICK = { x: W - 215, y: H - 205, r: 30 };
const SLOT_W = 78, SLOT_H = 54, SLOT_GAP = 8, SLOT_Y = H - 76;
const slotX = (i: number) => W / 2 - (MAX_SLOTS * SLOT_W + (MAX_SLOTS - 1) * SLOT_GAP) / 2 + i * (SLOT_W + SLOT_GAP);

export class GameScene extends Phaser.Scene {
  private net!: Net;
  private myId = '';
  private map: MapDef | null = null;
  private solids: Rect[] = [];
  private world: World | null = null;

  // local (predicted) player
  private me: Body | null = null;
  private meInfo: SnapPlayer | null = null;
  private prevInfo: SnapPlayer | null = null;
  private meDead = false;
  private meHurtUntil = 0;
  private turbo = false;
  private seq = 0;
  private acc = 0;
  private lastSend = 0;
  private pending: InputCmd[] = [];
  private outbox: InputCmd[] = [];
  private aim = 0;
  private facing = 1;
  private thrust = false;
  private dx = 0;
  private firing = false;
  private bombQ = false;
  private reloadQ = false;
  private pickQ = false;
  private selQ = -1;
  private usingMouse = true;
  private mouseOnUi = false;
  private lastJetFx = 0;

  private meSprite!: Phaser.GameObjects.Sprite;
  private meGun!: Phaser.GameObjects.Image;
  private meLabel!: Phaser.GameObjects.Text;

  private views = new Map<string, View>();
  private items = new Map<number, ItemObj>();
  private bombObjs = new Map<number, Phaser.GameObjects.Image>();
  private bullets = new Map<number, VBullet>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joyPtr: Phaser.Input.Pointer | null = null;
  private aimPtr: Phaser.Input.Pointer | null = null;
  private joyBase = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };

  private aimGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private roundText!: Phaser.GameObjects.Text;
  private mapText!: Phaser.GameObjects.Text;
  private teamTextB!: Phaser.GameObjects.Text;
  private teamTextR!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private scoreTextB!: Phaser.GameObjects.Text;
  private scoreTextR!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private bombText!: Phaser.GameObjects.Text;
  private feedText!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private overText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private itemText!: Phaser.GameObjects.Text;
  private pickLabel!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private bombIcon!: Phaser.GameObjects.Image;
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private feed: { msg: string; until: number }[] = [];
  private deathMsg = '';
  private endInfo: EndInfo | null = null;
  private endUntil = 0;
  private bannerUntil = 0;
  private lastSnap: Snap | null = null;

  constructor() { super('GameScene'); }

  private resetState() {
    this.map = null; this.solids = []; this.world = null;
    this.me = null; this.meInfo = null; this.prevInfo = null; this.meDead = false; this.meHurtUntil = 0; this.turbo = false;
    this.seq = 0; this.acc = 0; this.lastSend = 0; this.pending = []; this.outbox = [];
    this.aim = 0; this.facing = 1; this.thrust = false; this.dx = 0; this.firing = false;
    this.bombQ = false; this.reloadQ = false; this.pickQ = false; this.selQ = -1; this.mouseOnUi = false; this.lastJetFx = 0;
    this.views = new Map(); this.items = new Map(); this.bombObjs = new Map(); this.bullets = new Map();
    this.joyPtr = null; this.aimPtr = null; this.joyVec = { x: 0, y: 0 };
    this.slotIcons = []; this.slotTexts = []; this.feed = []; this.deathMsg = '';
    this.endInfo = null; this.endUntil = 0; this.bannerUntil = 0; this.lastSnap = null;
  }

  create() {
    this.resetState();
    this.net = this.registry.get('net') as Net;
    this.myId = this.net.room.sessionId;
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(2);

    const f = (s: number, e: number) => this.anims.generateFrameNumbers('soldier', { start: s, end: e });
    const mk = (key: string, frames: Phaser.Types.Animations.AnimationFrame[], frameRate: number, repeat: number) => {
      if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate, repeat });
    };
    mk('idle', f(0, 4), 6, -1); mk('walk', f(8, 14), 10, -1); mk('run', f(16, 22), 14, -1);
    mk('shoot', f(24, 30), 22, -1); mk('fly', f(33, 36), 14, -1); mk('die', f(40, 42), 5, 0);

    this.meSprite = this.add.sprite(0, 0, 'soldier', 0).setDepth(10).setVisible(false);
    this.meGun = this.add.image(0, 0, 'w_pistol').setDepth(11).setVisible(false);
    this.meLabel = this.add.text(0, 0, '', { ...TEXT, fontSize: '14px', color: '#9dffa8' }).setOrigin(0.5, 1).setDepth(12).setVisible(false);
    this.aimGfx = this.add.graphics().setDepth(12);
    this.barGfx = this.add.graphics().setDepth(12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('A,D,W,R,G,E,Q,M,SPACE,ONE,TWO,THREE') as Record<string, Phaser.Input.Keyboard.Key>;

    const onButton = (p: Phaser.Input.Pointer, b: { x: number; y: number; r: number }) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < b.r + 14;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.usingMouse = true; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlockAudio();
      if (p.wasTouch) this.usingMouse = false; else this.usingMouse = true;
      for (let i = 0; i < MAX_SLOTS; i++) {
        if (p.x > slotX(i) && p.x < slotX(i) + SLOT_W && p.y > SLOT_Y && p.y < SLOT_Y + SLOT_H) { this.selQ = i; if (!p.wasTouch) this.mouseOnUi = true; return; }
      }
      if (onButton(p, BTN_BOMB)) { this.bombQ = true; if (!p.wasTouch) this.mouseOnUi = true; return; }
      if (onButton(p, BTN_RELOAD)) { this.reloadQ = true; if (!p.wasTouch) this.mouseOnUi = true; return; }
      if (onButton(p, BTN_PICK)) { this.pickQ = true; if (!p.wasTouch) this.mouseOnUi = true; return; }
      if (p.wasTouch && p.x < W / 2) { if (!this.joyPtr) { this.joyPtr = p; this.joyBase = { x: p.x, y: p.y }; } }
      else if (p.wasTouch && !this.aimPtr) this.aimPtr = p;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p === this.joyPtr) this.joyPtr = null;
      if (p === this.aimPtr) this.aimPtr = null;
      if (!p.wasTouch) this.mouseOnUi = false;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.cycleWeapon(dy > 0 ? 1 : -1));

    this.buildHud();

    this.net.onSnap = (s) => { if (this.map) this.handleSnap(s); };
    this.net.onEvent = (e) => { if (this.map) this.handleEvent(e); else this.net.pendingEvents.push(e); };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.net.onSnap = null; this.net.onEvent = null; audio.jet(false); });
  }

  // ---------- the map ----------
  // The server tells us which map the current round uses; we draw it and start following our soldier.
  private initWorld(map: MapDef) {
    this.map = map;
    this.solids = map.solids;
    this.cameras.main.setBounds(-300, map.killTop - 300, map.W + 600, map.killBottom - map.killTop + 600);
    this.world = buildWorld(this, map);
    this.cameras.main.startFollow(this.meSprite, true, 0.1, 0.1);
    this.mapText.setText(map.name);
    if (this.net.latest) this.handleSnap(this.net.latest);
    this.net.pendingEvents.splice(0).forEach((e) => this.handleEvent(e));
  }

  private buildHud() {
    const st = (x: number, y: number, style: Phaser.Types.GameObjects.Text.TextStyle, ox = 0, oy = 0) =>
      this.add.text(x, y, '', style).setOrigin(ox, oy).setScrollFactor(0).setDepth(100);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.add.image(12, 10, 'head').setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.scoreText = st(16, 80, { ...TEXT, fontSize: '14px' });
    this.scoreTextB = st(16, 80, { ...TEXT, fontSize: '14px', color: TEAM_TEXT[0] });
    this.scoreTextR = st(16, 80, { ...TEXT, fontSize: '14px', color: TEAM_TEXT[1] });
    this.roundText = st(W / 2, 8, { ...TEXT, fontSize: '26px' }, 0.5, 0);
    this.mapText = st(W / 2, 40, { ...TEXT, fontSize: '14px' }, 0.5, 0);
    this.teamTextB = st(W / 2 - 18, 62, { ...TEXT, fontSize: '24px', color: TEAM_TEXT[0] }, 1, 0);
    this.teamTextR = st(W / 2 + 18, 62, { ...TEXT, fontSize: '24px', color: TEAM_TEXT[1] }, 0, 0);
    this.weaponText = st(W - 16, 10, { ...TEXT, fontSize: '24px' }, 1, 0);
    this.subText = st(W - 16, 40, { ...TEXT, fontSize: '15px' }, 1, 0);
    this.feedText = st(W - 16, 70, { ...TEXT, fontSize: '15px', align: 'right' }, 1, 0);
    this.warnText = st(W / 2, 112, { ...TEXT, fontSize: '26px', color: '#ff5a5a' }, 0.5, 0);
    this.statusText = st(W / 2, H / 2, { ...TEXT, fontSize: '28px', align: 'center' }, 0.5, 0.5);
    this.overText = st(W / 2, H / 2 - 10, { ...TEXT, fontSize: '24px', align: 'center' }, 0.5, 0.5);
    this.bannerText = st(W / 2, H / 3, { ...TEXT, fontSize: '56px', align: 'center', strokeThickness: 8 }, 0.5, 0.5);
    this.pickLabel = st(BTN_PICK.x, BTN_PICK.y, { ...TEXT, fontSize: '22px' }, 0.5, 0.5);
    this.pickLabel.setText('E');
    this.add.text(BTN_RELOAD.x, BTN_RELOAD.y, 'R', { ...TEXT, fontSize: '26px' }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.bombIcon = this.add.image(BTN_BOMB.x, BTN_BOMB.y, 'w_grenade').setScrollFactor(0).setDepth(102);
    this.bombText = st(BTN_BOMB.x + 22, BTN_BOMB.y + 18, { ...TEXT, fontSize: '18px' });
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.slotIcons.push(this.add.image(slotX(i) + SLOT_W / 2, SLOT_Y + 22, 'w_pistol').setScrollFactor(0).setDepth(102).setVisible(false));
      this.slotTexts.push(st(slotX(i) + SLOT_W / 2, SLOT_Y + SLOT_H - 4, { ...TEXT, fontSize: '13px', strokeThickness: 3 }, 0.5, 1));
      st(slotX(i) + 5, SLOT_Y + 2, { ...TEXT, fontSize: '12px', strokeThickness: 3 }).setText(String(i + 1));
    }
    this.itemText = this.add.text(0, 0, '', { ...TEXT, fontSize: '14px' }).setOrigin(0.5, 1).setDepth(60).setVisible(false);
    this.helpText = st(12, H - 10, { ...TEXT, fontSize: '12px' }, 0, 1);
    this.helpText.setText('A/D move | W or Space fly | hold mouse: fire | 1 2 3 or Q or wheel: choose gun | E: pick up / swap | G bomb | R reload | M mute');
  }

  private addFeed(msg: string) {
    this.feed.push({ msg, until: this.time.now + 5000 });
    if (this.feed.length > 6) this.feed.shift();
  }

  private nameOf(id: string): string {
    return this.net.roster.find((r) => r.id === id)?.name ?? 'Soldier';
  }
  private teamOf(id: string): number {
    return this.net.roster.find((r) => r.id === id)?.team ?? -1;
  }

  // ---------- effects ----------
  private flash(x: number, y: number, color: number, size: number, ms: number, grow = 0.3, alpha = 1) {
    const c = this.add.circle(x, y, size, color, alpha).setDepth(14);
    this.tweens.add({ targets: c, alpha: 0, scale: grow, duration: ms, onComplete: () => c.destroy() });
  }

  private burst(x: number, y: number, n = 10, color = 0xff5252) {
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, 'spark').setDepth(14).setTint(color);
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 50;
      this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 350, onComplete: () => s.destroy() });
    }
  }

  private jetFx(x: number, feetY: number, facing: number) {
    for (let i = 0; i < 2; i++) {
      const c = this.add.circle(x - facing * 13 + (Math.random() - 0.5) * 6, feetY - 22, 3 + Math.random() * 3, i ? 0xffd34d : 0xff8a1f).setDepth(8);
      this.tweens.add({ targets: c, y: c.y + 40 + Math.random() * 30, x: c.x + (Math.random() - 0.5) * 16, alpha: 0, scale: 0.3, duration: 280, onComplete: () => c.destroy() });
    }
    const smoke = this.add.circle(x - facing * 13, feetY - 14, 5, 0xcfd8dc, 0.5).setDepth(7);
    this.tweens.add({ targets: smoke, y: smoke.y + 60, alpha: 0, scale: 2.2, duration: 600, onComplete: () => smoke.destroy() });
  }

  private boom(x: number, y: number, r: number) {
    this.flash(x, y, 0xff9800, r * 0.28, 380, 3.6);
    this.flash(x, y, 0xffffff, r * 0.16, 220, 3);
    this.burst(x, y, 18, 0xffb74d);
    for (let i = 0; i < 7; i++) {
      const s = this.add.circle(x + (Math.random() - 0.5) * r * 0.8, y + (Math.random() - 0.5) * r * 0.6, r * 0.12, 0x555555, 0.55).setDepth(13);
      this.tweens.add({ targets: s, y: s.y - 50 - Math.random() * 60, scale: 2.4, alpha: 0, duration: 800 + Math.random() * 400, onComplete: () => s.destroy() });
    }
    const d = this.distToMe(x, y);
    if (d < 700) this.cameras.main.shake(200, 0.009 * (1 - d / 700) + 0.002);
    audio.play('boom', this.volumeAt(x, y));
  }

  private distToMe(x: number, y: number) {
    const c = this.cameras.main;
    return Math.hypot((this.me?.x ?? c.midPoint.x) - x, (this.me?.y ?? c.midPoint.y) - y);
  }
  private volumeAt(x: number, y: number) { return clamp(1 - this.distToMe(x, y) / 1700, 0.12, 1); }

  // a soldier who was just eliminated falls to the floor and lies there for a moment
  private corpse(x: number, feetY: number, flip: boolean) {
    const s = this.add.sprite(x, feetToCenter(feetY), 'soldier', 40).setDepth(9).setFlipX(flip);
    s.play('die');
    let floor = feetY + 800;
    for (const r of this.solids) { const t = segHit(x, feetY, x, feetY + 1500, r); if (t !== null) floor = Math.min(floor, feetY + t * 1500); }
    this.tweens.add({ targets: s, y: feetToCenter(floor), duration: clamp(120 + (floor - feetY) * 0.9, 120, 800), ease: 'Quad.easeIn' });
    this.time.delayedCall(1700, () => this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() }));
    this.burst(x, feetY - 30, 14);
  }

  // ---------- events from the server ----------
  private handleEvent(e: GameEvent) {
    switch (e.type) {
      case 'shot': {
        const rocket = e.w === 'rpg';
        const img = this.add.image(e.x, e.y, rocket ? 'rocket' : 'bullet').setDepth(9).setRotation(Math.atan2(e.vy, e.vx));
        this.bullets.set(e.id, { img, vx: e.vx, vy: e.vy, ttl: e.ttl, rocket });
        const a = Math.atan2(e.vy, e.vx);
        this.flash(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, 0xffe27a, 9, 90);
        const def = isWeapon(e.w) ? WEAPONS[e.w] : null;
        if (def) {
          const sfx = def.cls === 'heavy' ? 'rocket' : def.cls === 'melee' ? 'knife' : def.cls;
          audio.play(sfx as audio.Sfx, this.volumeAt(e.x, e.y));
          if (def.kind === 'gun' && this.distToMe(e.x, e.y) < 900) {          // an empty shell pops out
            const c = this.add.image(e.x, e.y, 'spark').setDepth(14).setTint(0xffd34d).setScale(0.5);
            this.tweens.add({ targets: c, x: e.x - Math.cos(a) * 18, y: e.y - 26, alpha: 0, duration: 420, onComplete: () => c.destroy() });
          }
        }
        break;
      }
      case 'hit': {
        const b = this.bullets.get(e.b);
        if (b) { b.img.destroy(); this.bullets.delete(e.b); }
        if (e.t) this.burst(e.x, e.y, 6, 0xff5252); else this.burst(e.x, e.y, 4, 0xffe27a);
        break;
      }
      case 'boom': this.boom(e.x, e.y, e.r); break;
      case 'melee': {
        const g = this.add.graphics().setDepth(14);
        g.lineStyle(5, 0xffffff, 0.9).beginPath().arc(e.x, e.y, 46, e.a - 0.9, e.a + 0.9).strokePath();
        this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
        audio.play('knife', this.volumeAt(e.x, e.y));
        break;
      }
      case 'kill': {
        const victim = this.nameOf(e.v);
        const wname = isWeapon(e.w) ? WEAPONS[e.w].name : (e.w in BOMBS ? BOMBS[e.w as 'grenade'].name : '');
        if (e.w === 'out') this.addFeed(`${victim} left the arena`);
        else if (e.k && e.k !== e.v) this.addFeed(`${this.nameOf(e.k)} [${wname}] ${victim}`);
        else this.addFeed(`${victim} blew themselves up`);
        if (e.v === this.myId) this.deathMsg = e.w === 'out' ? 'You left the arena' : e.k && e.k !== e.v ? `Eliminated by ${this.nameOf(e.k)}` : 'You died';
        break;
      }
      case 'round': {
        this.endInfo = null; this.endUntil = 0; this.feed = [];
        this.bannerText.setText(`ROUND ${e.n}`); this.bannerUntil = this.time.now + 2200;
        audio.play('round');
        break;
      }
      case 'roundEnd': {
        this.endInfo = e as unknown as EndInfo;
        this.endUntil = this.time.now + e.next * 1000;
        audio.play(e.series ? 'win' : 'round');
        break;
      }
    }
  }

  // ---------- snapshots ----------
  private makeView(id: string): View {
    const sprite = this.add.sprite(0, 0, 'soldier', 0).setDepth(9);
    const gun = this.add.image(0, 0, 'w_pistol').setDepth(10);
    const label = this.add.text(0, 0, this.nameOf(id), { ...TEXT, fontSize: '14px', color: '#ffb3b3' }).setOrigin(0.5, 1).setDepth(12);
    const v: View = { sprite, gun, label, buf: [], lastX: 0, lastY: 0, lastHp: 100, hurtUntil: 0, wasDead: false, lastJet: 0, facing: 1 };
    this.views.set(id, v);
    return v;
  }

  private handleSnap(s: Snap) {
    this.lastSnap = s;
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of s.p) {
      seen.add(p.id);
      if (p.id === this.myId) { this.reconcile(p); continue; }
      const v = this.views.get(p.id) ?? this.makeView(p.id);
      if (p.hp < v.lastHp && !p.d) { v.hurtUntil = this.time.now + 220; audio.play('hurt', this.volumeAt(p.x, p.y) * 0.7); }
      if (p.d && !v.wasDead && v.buf.length) this.corpse(v.lastX, v.lastY, Math.cos(v.facing) < 0);
      v.lastHp = p.hp; v.wasDead = p.d;
      v.buf.push({ ...p, at: now });
      if (v.buf.length > 30) v.buf.shift();
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.sprite.destroy(); v.gun.destroy(); v.label.destroy(); this.views.delete(id); }
    }
    this.syncItems(s);
    this.syncBombs(s);
  }

  private reconcile(p: SnapPlayer) {
    const wasDead = this.meDead;
    const prev = this.meInfo;
    this.meDead = p.d;
    this.prevInfo = prev;
    this.meInfo = p;
    this.turbo = p.tb > 0;

    if (prev && !p.d) {
      if (p.hp < prev.hp) { this.meHurtUntil = this.time.now + 220; audio.play('hurt'); this.cameras.main.flash(90, 255, 60, 60, true); }
      if (p.ws.length > prev.ws.length || p.bm > prev.bm || (p.tb > 0 && prev.tb <= 0) || (p.ws.length === prev.ws.length && p.w !== prev.w && p.cu === prev.cu)) audio.play('pickup');
      if (p.cu !== prev.cu && p.ws.length === prev.ws.length) audio.play('swap');
      if (p.rl && !prev.rl) audio.play('reload');
    }
    if (p.d && !wasDead && this.me) { this.corpse(this.me.x, this.me.y, Math.cos(this.aim) < 0); audio.play('die'); }
    if (wasDead && !p.d) this.deathMsg = '';

    this.pending = this.pending.filter((c) => c.seq > p.ack);
    if (!this.me || p.d || wasDead) {
      this.me = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.g };
      this.pending = [];
      this.outbox = [];
      return;
    }
    const t: Body = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.g };
    for (const c of this.pending) stepBody(t, c.dx, c.thrust, this.turbo, this.solids);
    if (Math.hypot(t.x - this.me.x, t.y - this.me.y) > 2) Object.assign(this.me, t);
  }

  // ---------- things lying on the ground ----------
  private itemVisual(type: string): { key: string; scale: number } {
    if (isWeapon(type)) return { key: 'w_' + type, scale: 0.5 * Math.max(1, 38 / WEAPONS[type].len) };
    if (type === 'turbo') return { key: 'icon_turbo_flat', scale: 1 };
    return { key: 'w_' + type, scale: 0.8 };
  }
  private itemName(type: string): string {
    if (isWeapon(type)) return WEAPONS[type].name;
    if (type === 'turbo') return 'TURBO ROCKET';
    return type in BOMBS ? BOMBS[type as 'grenade'].name : type;
  }

  private syncItems(s: Snap) {
    const seen = new Set<number>();
    for (const [id, type, x, y] of s.pk) {
      seen.add(id);
      let o = this.items.get(id);
      if (!o) {
        const v = this.itemVisual(type);
        const img = this.add.image(x, y - 1, v.key).setOrigin(0.5, 1).setScale(v.scale).setDepth(3);
        const shadow = this.add.ellipse(x, y - 1, img.displayWidth * 0.9, 6, 0x000000, 0.28).setDepth(2);
        const spark = this.add.image(x, y - 10, 'twinkle').setDepth(4).setAlpha(0);
        this.tweens.add({ targets: spark, alpha: 1, scale: 1.4, duration: 450, yoyo: true, repeat: -1, repeatDelay: 900 + (id % 7) * 250, delay: (id % 5) * 300 });
        o = { type, img, shadow, spark, tx: x, ty: y };
        this.items.set(id, o);
      }
      o.tx = x; o.ty = y;
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { o.img.destroy(); o.shadow.destroy(); o.spark.destroy(); this.items.delete(id); }
  }

  private syncBombs(s: Snap) {
    const seen = new Set<number>();
    for (const [id, x, y, kind] of s.bm) {
      seen.add(id);
      let b = this.bombObjs.get(id);
      if (!b) { b = this.add.image(x, y, 'w_' + kind).setDepth(9).setScale(0.55); this.bombObjs.set(id, b); audio.play('throw', this.volumeAt(x, y)); }
      b.setPosition(x, y).setRotation(b.rotation + 0.3);
    }
    for (const [id, b] of this.bombObjs) if (!seen.has(id)) { b.destroy(); this.bombObjs.delete(id); }
  }

  // ---------- main loop ----------
  update(_time: number, delta: number) {
    const cam = this.cameras.main;
    if (!this.map) {
      if (!this.net.mapId) return;
      this.initWorld(getMap(this.net.mapId));
    } else if (this.net.mapId && this.net.mapId !== this.map.id) {     // next round is on another map: rebuild the scene
      audio.jet(false);
      this.scene.restart();
      return;
    }
    if (this.world) updateBackdrop(this.world, cam);

    if (!this.isTyping() && Phaser.Input.Keyboard.JustDown(this.keys.M)) { audio.setMuted(!audio.isMuted()); document.getElementById('mute')?.dispatchEvent(new Event('sync')); }
    this.readInput();
    this.runLocalSimulation(delta);
    this.updateBullets(delta / 1000);
    this.aimGfx.clear();
    this.barGfx.clear();
    this.renderMe();
    this.renderRemotes();
    this.renderItems();
    this.renderHud();
    audio.jet(this.thrust && !this.meDead && !!this.me);
  }

  private cycleWeapon(dir: number) {
    const n = this.meInfo?.ws.length ?? 0;
    if (n > 1 && this.meInfo) this.selQ = (this.meInfo.cu + dir + n) % n;
  }

  private isTyping() {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable);
  }

  private readInput() {
    if (this.isTyping()) {
      this.dx = 0; this.thrust = false; this.firing = false;
      this.bombQ = false; this.reloadQ = false; this.pickQ = false; this.selQ = -1;
      return;
    }
    let dx = Number(this.cursors.right.isDown || this.keys.D.isDown) - Number(this.cursors.left.isDown || this.keys.A.isDown);
    let thrust = this.cursors.up.isDown || this.keys.W.isDown || this.keys.SPACE.isDown;
    let joyAngle: number | null = null;
    if (this.joyPtr) {
      const p = this.joyPtr;
      let vx = (p.x - this.joyBase.x) / JOY_R;
      let vy = (p.y - this.joyBase.y) / JOY_R;
      const len = Math.hypot(vx, vy);
      if (len > 1) { vx /= len; vy /= len; }
      this.joyVec = { x: vx, y: vy };
      if (Math.abs(vx) > 0.15) dx = vx;
      if (vy < -0.35) thrust = true;
      if (len > 0.35) joyAngle = Math.atan2(vy, vx);      // the soldier turns toward where you steer
    } else this.joyVec = { x: 0, y: 0 };
    this.dx = dx;
    this.thrust = thrust;

    const mouse = this.input.mousePointer;
    this.firing = !!this.aimPtr?.isDown || (this.usingMouse && mouse.leftButtonDown() && !this.mouseOnUi);
    if (Phaser.Input.Keyboard.JustDown(this.keys.G)) this.bombQ = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reloadQ = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.pickQ = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.cycleWeapon(1);
    const n = this.meInfo?.ws.length ?? 1;
    [this.keys.ONE, this.keys.TWO, this.keys.THREE].forEach((k, i) => { if (Phaser.Input.Keyboard.JustDown(k) && i < n) this.selQ = i; });

    if (!this.me) return;
    const cam = this.cameras.main;
    const ptr = this.aimPtr?.isDown ? this.aimPtr : (this.usingMouse ? mouse : null);
    if (ptr) {
      ptr.updateWorldPoint(cam);
      this.aim = Math.atan2(ptr.worldY - (this.me.y - 30), ptr.worldX - this.me.x);
    } else if (joyAngle !== null) this.aim = joyAngle;
    else if (dx) this.aim = dx > 0 ? 0 : Math.PI;
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  private runLocalSimulation(delta: number) {
    if (this.me && !this.meDead) {
      this.acc = Math.min(this.acc + delta / 1000, 0.1);
      while (this.acc >= FIXED_DT) {
        this.acc -= FIXED_DT;
        const cmd: InputCmd = {
          seq: ++this.seq, dx: this.dx, thrust: this.thrust, aim: this.aim, fire: this.firing,
          bomb: this.bombQ, reload: this.reloadQ, pick: this.pickQ, sel: this.selQ,
        };
        this.bombQ = false; this.reloadQ = false; this.pickQ = false; this.selQ = -1;     // one-shot actions
        stepBody(this.me, cmd.dx, cmd.thrust, this.turbo, this.solids);                    // predict movement immediately
        this.pending.push(cmd);
        this.outbox.push(cmd);
      }
      if (this.pending.length > 180) this.pending.splice(0, this.pending.length - 180);
    }
    const now = performance.now();
    if (this.outbox.length && (this.outbox.length >= 2 || now - this.lastSend > 33)) {
      this.net.sendInputs(this.outbox.splice(0, 10));
      this.lastSend = now;
    }
  }

  // Bullets are drawn here from the server's "shot" events; the server decides what they really hit.
  private updateBullets(dt: number) {
    for (const [id, b] of this.bullets) {
      const x0 = b.img.x, y0 = b.img.y;
      const x1 = x0 + b.vx * dt, y1 = y0 + b.vy * dt;
      let blocked = false;
      for (const s of this.solids) if (segHit(x0, y0, x1, y1, s) !== null) { blocked = true; break; }
      b.ttl -= dt;
      if (blocked || b.ttl <= 0) { b.img.destroy(); this.bullets.delete(id); continue; }
      b.img.setPosition(x1, y1);
      if (b.rocket && Math.random() < 0.6) this.flash(x1 - Math.cos(b.img.rotation) * 12, y1 - Math.sin(b.img.rotation) * 12, 0xcfd8dc, 5, 400, 1.8);
    }
  }

  private animate(sprite: Phaser.GameObjects.Sprite, vx: number, thrust: boolean, onGround: boolean, firing: boolean, hurt: boolean) {
    if (hurt) { sprite.anims.stop(); sprite.setFrame(40); return; }
    if (!onGround) {
      if (thrust) sprite.play('fly', true); else { sprite.anims.stop(); sprite.setFrame(37); }
    } else if (firing) sprite.play('shoot', true);
    else if (Math.abs(vx) > 5) sprite.play(Math.abs(vx) > SPEED * 0.7 ? 'run' : 'walk', true);
    else sprite.play('idle', true);
  }

  private placeGun(img: Phaser.GameObjects.Image, x: number, feetY: number, aim: number, w: WeaponKey, show: boolean) {
    const key = 'w_' + w;
    if (img.texture.key !== key) img.setTexture(key);
    img.setOrigin(0.22, 0.5).setScale(0.5)
      .setPosition(x + Math.cos(aim) * 8, feetY - 28 + Math.sin(aim) * 8)
      .setRotation(aim).setFlipY(Math.cos(aim) < 0).setVisible(show);
  }

  // life bar over a soldier's head
  private hpBar(x: number, feetY: number, hp: number, team: number) {
    const col = team >= 0 ? TEAM_COLORS[team] : 0xffffff;
    this.barGfx.fillStyle(0x000000, 0.7).fillRect(x - 25, feetY - 90, 50, 9);
    this.barGfx.fillStyle(hp > 60 ? 0x4cd964 : hp > 30 ? 0xffc107 : 0xff4a3c).fillRect(x - 23, feetY - 88, 46 * clamp(hp / 100, 0, 1), 5);
    this.barGfx.lineStyle(2, col, 0.95).strokeRect(x - 25, feetY - 90, 50, 9);
  }

  private drawAim(x: number, feetY: number, aim: number, color: number, len: number) {
    const cx = x, cy = feetY - 30;
    this.aimGfx.lineStyle(2, color, 0.4).lineBetween(cx + Math.cos(aim) * (len + 4), cy + Math.sin(aim) * (len + 4), cx + Math.cos(aim) * (len + 22), cy + Math.sin(aim) * (len + 22));
  }

  private renderMe() {
    const m = this.me;
    if (!m) return;
    this.statusText.setVisible(false);
    const info = this.meInfo;
    const show = !this.meDead;
    const now = this.time.now;
    this.meSprite.setVisible(show);
    this.meLabel.setVisible(show);
    this.meSprite.setPosition(m.x, feetToCenter(m.y));
    this.meSprite.setFlipX(this.facing < 0);
    // lean into the direction of flight
    this.meSprite.setAngle(m.onGround ? 0 : clamp((m.vx / SPEED) * 18, -18, 18));
    this.meSprite.setAlpha(info?.iv && Math.floor(now / 100) % 2 ? 0.4 : 1);
    this.animate(this.meSprite, m.vx, this.thrust, m.onGround, this.firing, now < this.meHurtUntil);
    const team = info?.tm ?? -1;
    this.meLabel.setText(this.nameOf(this.myId)).setPosition(m.x, m.y - 94).setColor(team >= 0 ? TEAM_TEXT[team] : '#9dffa8');
    const w = (info?.w ?? 'pistol') as WeaponKey;
    this.placeGun(this.meGun, m.x, m.y, this.aim, w, show);
    if (show) {
      this.drawAim(m.x, m.y, this.aim, 0x9dffa8, WEAPONS[w].len);
      this.hpBar(m.x, m.y, info?.hp ?? 100, team);
      if (this.thrust && now - this.lastJetFx > 55) { this.jetFx(m.x, m.y, this.facing); this.lastJetFx = now; }
    }
  }

  private renderRemotes() {
    const rt = performance.now() - INTERP_DELAY_MS;
    const now = this.time.now;
    for (const [id, v] of this.views) {
      const b = v.buf;
      if (!b.length) continue;
      const i = b.findIndex((s) => s.at > rt);
      let from: Sample;
      let to: Sample;
      if (i === -1) { from = to = b[b.length - 1]; }
      else if (i === 0) { from = to = b[0]; }
      else { from = b[i - 1]; to = b[i]; }
      let f = from === to ? 0 : (rt - from.at) / (to.at - from.at);
      if (Math.hypot(to.x - from.x, to.y - from.y) > 300) f = 1;
      const x = from.x + (to.x - from.x) * f;
      const y = from.y + (to.y - from.y) * f;
      const aim = from.a + (to.a - from.a) * f;
      v.lastX = x; v.lastY = y; v.facing = aim;
      const show = !to.d;
      v.sprite.setVisible(show).setPosition(x, feetToCenter(y)).setFlipX(Math.cos(aim) < 0);
      v.sprite.setAngle(to.g ? 0 : clamp((to.vx / SPEED) * 18, -18, 18));
      v.sprite.setAlpha(to.iv && Math.floor(now / 100) % 2 ? 0.4 : 1);
      const team = to.tm;
      v.label.setVisible(show).setPosition(x, y - 94).setColor(team >= 0 ? TEAM_TEXT[team] : '#ffb3b3');
      if (v.label.text !== this.nameOf(id)) v.label.setText(this.nameOf(id));
      this.placeGun(v.gun, x, y, aim, to.w, show);
      this.animate(v.sprite, to.vx, to.th, to.g, false, now < v.hurtUntil);
      if (show) {
        this.drawAim(x, y, aim, team >= 0 ? TEAM_COLORS[team] : 0xffb3b3, WEAPONS[to.w].len);
        this.hpBar(x, y, to.hp, team);
        if (to.th && now - v.lastJet > 70) { this.jetFx(x, y, Math.cos(aim) >= 0 ? 1 : -1); v.lastJet = now; }
      }
    }
  }

  private renderItems() {
    for (const o of this.items.values()) {
      o.img.x += (o.tx - o.img.x) * 0.5; o.img.y += (o.ty - 1 - o.img.y) * 0.5;
      o.shadow.setPosition(o.img.x, o.ty - 1);
      o.spark.setPosition(o.img.x + (o.img.displayWidth * 0.3), o.img.y - o.img.displayHeight * 0.6);
    }
    // name of the closest item, and how to swap when the bag is full
    const m = this.me;
    let best: ItemObj | null = null; let bd = 150;
    if (m && !this.meDead) for (const o of this.items.values()) { const d = Math.hypot(o.tx - m.x, (o.ty - 14) - (m.y - 28)); if (d < bd) { bd = d; best = o; } }
    if (best) {
      const full = (this.meInfo?.ws.length ?? 0) >= MAX_SLOTS && isWeapon(best.type) && !this.meInfo?.ws.some((x) => x[0] === best!.type);
      this.itemText.setText(this.itemName(best.type) + (full ? '   [E] swap' : '')).setPosition(best.img.x, best.img.y - best.img.displayHeight - 14).setVisible(true);
    } else this.itemText.setVisible(false);
  }

  private renderHud() {
    const w = this.net.welcome;
    const roster = this.net.roster;
    const info = this.meInfo;
    const snap = this.lastSnap;
    const now = this.time.now;
    const teams = this.net.info.mode === 'teams';

    this.roundText.setText(`ROUND ${this.net.info.n} / ${this.net.info.rounds}`);
    const objective = w?.code === 'PUBLIC' ? 'Eliminate the other team' : `First to ${this.net.info.target} kills`;
    this.mapText.setText(`${this.map?.name ?? ''}   |   ${objective}${w ? `   |   ${w.code === 'PUBLIC' ? 'Public' : 'Room ' + w.code}  ${roster.length}/${w.maxPlayers}` : ''}`);
    this.teamTextB.setVisible(teams).setText(teams && snap ? `${TEAM_NAMES[0]} ${snap.tk[0]}` : '');
    this.teamTextR.setVisible(teams).setText(teams && snap ? `${snap.tk[1]} ${TEAM_NAMES[1]}` : '');

    if (snap) {
      const rows = [...snap.p].sort((a, b) => b.k - a.k || a.de - b.de);
      const line = (p: SnapPlayer) => `${p.id === this.myId ? '>' : ' '}${this.nameOf(p.id).padEnd(13).slice(0, 13)} ${String(p.k).padStart(2)}/${p.de}  W${p.wn}`;
      if (teams) {
        const b = rows.filter((p) => p.tm === 0), r = rows.filter((p) => p.tm === 1);
        this.scoreText.setText('');
        this.scoreTextB.setText([`${TEAM_NAMES[0]}  rounds ${snap.tw[0]}`, ...b.map(line)].join('\n')).setPosition(16, 80);
        this.scoreTextR.setText([`${TEAM_NAMES[1]}  rounds ${snap.tw[1]}`, ...r.map(line)].join('\n')).setPosition(16, 80 + 18 * (b.length + 2));
      } else {
        this.scoreTextB.setText(''); this.scoreTextR.setText('');
        this.scoreText.setText(['kills/deaths  W = rounds won', ...rows.map(line)].join('\n'));
      }
    }

    const h = this.hud; h.clear();
    const hp = info?.hp ?? 100;
    h.fillStyle(0x1b2733, 0.85).fillRoundedRect(90, 14, 232, 30, 8);
    h.fillStyle(hp > 60 ? 0x4cd964 : hp > 30 ? 0xffc107 : 0xff4a3c).fillRoundedRect(94, 18, 224 * (hp / 100), 22, 6);
    h.fillStyle(0x1b2733, 0.7).fillCircle(BTN_BOMB.x, BTN_BOMB.y, BTN_BOMB.r).fillCircle(BTN_RELOAD.x, BTN_RELOAD.y, BTN_RELOAD.r).fillCircle(BTN_PICK.x, BTN_PICK.y, BTN_PICK.r);
    h.lineStyle(3, 0xffffff, 0.6).strokeCircle(BTN_BOMB.x, BTN_BOMB.y, BTN_BOMB.r).strokeCircle(BTN_RELOAD.x, BTN_RELOAD.y, BTN_RELOAD.r).strokeCircle(BTN_PICK.x, BTN_PICK.y, BTN_PICK.r);
    if (this.joyPtr) {
      const b = this.joyBase, v = this.joyVec;
      h.fillStyle(0xffffff, 0.12).fillCircle(b.x, b.y, JOY_R);
      h.lineStyle(3, 0xffffff, 0.5).strokeCircle(b.x, b.y, JOY_R);
      h.fillStyle(0xffffff, 0.55).fillCircle(b.x + v.x * JOY_R, b.y + v.y * JOY_R, 28);
    }

    // the three weapon slots: tap or press 1, 2, 3 to choose
    for (let i = 0; i < MAX_SLOTS; i++) {
      const has = info && i < info.ws.length;
      const sel = !!info && info.cu === i && !!has;
      h.fillStyle(sel ? 0x3a5a7a : 0x1b2733, has ? 0.9 : 0.4).fillRoundedRect(slotX(i), SLOT_Y, SLOT_W, SLOT_H, 8);
      h.lineStyle(sel ? 4 : 2, sel ? 0xffd34d : 0xffffff, sel ? 1 : 0.35).strokeRoundedRect(slotX(i), SLOT_Y, SLOT_W, SLOT_H, 8);
      const icon = this.slotIcons[i], txt = this.slotTexts[i];
      if (info && has) {
        const [k, am, rs] = info.ws[i];
        const def = WEAPONS[k];
        icon.setTexture('w_' + k).setVisible(true);
        icon.setScale(Math.min(0.5, 62 / icon.width, 26 / icon.height));
        txt.setText(def.kind === 'melee' ? '' : `${am}/${rs < 0 ? '\u221e' : rs}`);
      } else { icon.setVisible(false); txt.setText(''); }
    }

    if (info) {
      const def = WEAPONS[info.w];
      this.weaponText.setText(def.kind === 'melee' ? def.name : `${def.name}  ${info.am}/${info.rs < 0 ? '\u221e' : info.rs}`);
      this.subText.setText([info.rl ? 'RELOADING' : '', info.tb > 0 ? `TURBO ${Math.ceil(info.tb / 1000)}s` : ''].filter(Boolean).join('   '));
      this.bombIcon.setTexture('w_' + info.bk).setScale(0.8);
      this.bombText.setText(`x${info.bm}`);
    }
    this.helpText.setVisible(this.usingMouse);

    this.feed = this.feed.filter((f) => f.until > now);
    this.feedText.setText(this.feed.map((f) => f.msg).join('\n'));

    const m = this.me, mp = this.map;
    const outside = !!m && !!mp && outOfBounds(m, mp);
    const nearEdge = !!m && !!mp && (m.x < 150 || m.x > mp.W - 150 || m.y < mp.killTop + 150 || m.y > mp.killBottom - 150);
    const warn = !this.meDead && (outside || nearEdge);
    const warning = outside ? 'OUTSIDE ARENA! HEALTH DRAINING' : 'WARNING: RETURN TO THE ARENA';
    this.warnText.setText(warn && Math.floor(now / 250) % 2 ? warning : '');
    if (this.meDead) this.statusText.setText(`${this.deathMsg || 'You died'}\nRespawning...`).setVisible(true);

    this.bannerText.setVisible(now < this.bannerUntil).setAlpha(clamp((this.bannerUntil - now) / 500, 0, 1));

    // between rounds: who won, and the standings
    if (snap && snap.ph !== 'play' && this.endInfo) {
      const e = this.endInfo;
      const secs = Math.max(0, Math.ceil((this.endUntil - now) / 1000));
      const head = e.series ? `SERIES OVER\nChampion: ${e.champion}` : `ROUND ${e.n} OVER\n${e.winnerName} wins the round`;
      const rows = e.scores.slice(0, 8).map((r, i) => `${i + 1}. ${r.name.padEnd(13).slice(0, 13)} ${String(r.k).padStart(2)} kills  ${r.d} deaths  ${r.w} rounds won`);
      const foot = e.series
        ? (this.net.welcome?.code === 'PUBLIC' ? 'Match complete. Leave to find another match.' : `New series in ${secs}s`)
        : `Next round in ${secs}s (new map)`;
      this.overText.setText([head, '', ...rows, '', foot].join('\n')).setVisible(true);
      h.fillStyle(0x000000, 0.45).fillRect(W / 2 - 330, H / 2 - 200, 660, 400);
    } else this.overText.setVisible(false);
  }
}
