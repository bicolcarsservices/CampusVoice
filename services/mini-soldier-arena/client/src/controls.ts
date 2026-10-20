import { GAME_H, GAME_W } from './config';

export type ControlName = 'move' | 'aim' | 'bomb' | 'reload' | 'pick' | 'slots';
export interface Point { x: number; y: number }
export type ControlLayout = Record<ControlName, Point>;

export const CONTROL_LAYOUT_KEY = 'msa-controls';
export const CONTROL_NAMES: ControlName[] = ['move', 'aim', 'bomb', 'reload', 'pick', 'slots'];
export const CONTROL_LABELS: Record<ControlName, string> = {
  move: 'Move joystick',
  aim: 'Attack / fire joystick',
  bomb: 'Bomb',
  reload: 'Reload',
  pick: 'Pickup',
  slots: 'Weapon bar',
};
export const defaultControlLayout = (): ControlLayout => ({
  move: { x: 145, y: GAME_H - 180 },
  aim: { x: GAME_W - 350, y: GAME_H - 180 },
  bomb: { x: GAME_W - 110, y: GAME_H - 170 },
  reload: { x: GAME_W - 215, y: GAME_H - 120 },
  pick: { x: GAME_W - 215, y: GAME_H - 205 },
  slots: { x: GAME_W / 2, y: GAME_H - 49 },
});

export function loadControlLayout(): ControlLayout {
  const defaults = defaultControlLayout();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CONTROL_LAYOUT_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    const layout = { ...defaults };
    for (const name of CONTROL_NAMES) {
      const point = (saved as Record<string, unknown>)[name];
      if (point && typeof point === 'object') {
        const x = (point as Record<string, unknown>).x;
        const y = (point as Record<string, unknown>).y;
        if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
          layout[name] = { x: Math.max(40, Math.min(GAME_W - 40, x)), y: Math.max(40, Math.min(GAME_H - 40, y)) };
        }
      }
    }
    return layout;
  } catch { return defaults; }
}

export function saveControlLayout(layout: ControlLayout): void {
  try { localStorage.setItem(CONTROL_LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage may be blocked */ }
}
