import { GAME_H, GAME_W } from './config';

export type ControlId = 'joystick' | 'attack' | 'fly' | 'bomb' | 'reload' | 'pickup' | 'slot1' | 'slot2' | 'slot3';
export type ActionId = 'left' | 'right' | 'fly' | 'flyAlt' | 'fire' | 'bomb' | 'reload' | 'pickup' | 'nextWeapon' | 'slot1' | 'slot2' | 'slot3' | 'mute';

export interface ControlPosition { x: number; y: number }
export interface ControlSettings {
  layout: Record<ControlId, ControlPosition>;
  size: number;
  opacity: number;
  keys: Record<ActionId, string>;
}

const STORAGE_KEY = 'mini-soldier-arena-controls-v1';

const defaultLayout: Record<ControlId, ControlPosition> = {
  joystick: { x: 0.12, y: 0.76 },
  attack: { x: 0.89, y: 0.76 },
  fly: { x: 0.77, y: 0.62 },
  bomb: { x: 0.91, y: 0.53 },
  reload: { x: 0.79, y: 0.83 },
  pickup: { x: 0.65, y: 0.68 },
  slot1: { x: 0.39, y: 0.91 },
  slot2: { x: 0.50, y: 0.91 },
  slot3: { x: 0.61, y: 0.91 },
};

const defaultKeys: Record<ActionId, string> = {
  left: 'A', right: 'D', fly: 'W', flyAlt: 'SPACE', fire: 'F', bomb: 'G', reload: 'R',
  pickup: 'E', nextWeapon: 'Q', slot1: '1', slot2: '2', slot3: '3', mute: 'M',
};

const defaults: ControlSettings = { layout: defaultLayout, size: 1, opacity: 0.72, keys: defaultKeys };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function load(): ControlSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return structuredClone(defaults);
    const layout = isRecord(value.layout) ? value.layout : {};
    const keys = isRecord(value.keys) ? value.keys : {};
    const next = structuredClone(defaults);
    for (const id of Object.keys(defaultLayout) as ControlId[]) {
      const position = layout[id];
      if (isRecord(position) && typeof position.x === 'number' && Number.isFinite(position.x) &&
        typeof position.y === 'number' && Number.isFinite(position.y)) {
        next.layout[id] = { x: clamp(position.x, 0.02, 0.98), y: clamp(position.y, 0.08, 0.94) };
      }
    }
    for (const action of Object.keys(defaultKeys) as ActionId[]) {
      const key = keys[action];
      if (typeof key === 'string' && key.length <= 12) next.keys[action] = key;
    }
    if (typeof value.size === 'number' && Number.isFinite(value.size)) next.size = clamp(value.size, 0.65, 1.5);
    if (typeof value.opacity === 'number' && Number.isFinite(value.opacity)) next.opacity = clamp(value.opacity, 0.25, 1);
    return next;
  } catch {
    return structuredClone(defaults);
  }
}

let settings = load();

export function getControlSettings(): ControlSettings {
  return settings;
}

export function getControlPosition(id: ControlId): { x: number; y: number } {
  const position = settings.layout[id];
  return { x: position.x * GAME_W, y: position.y * GAME_H };
}

export function saveControlSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save control settings on this device.', error);
  }
}

export function updateControlPosition(id: ControlId, x: number, y: number) {
  settings.layout[id] = {
    x: clamp(x / GAME_W, 0.02, 0.98),
    y: clamp(y / GAME_H, 0.08, 0.94),
  };
}

export function updateControlSettings(values: { size?: number; opacity?: number }) {
  if (values.size !== undefined) settings.size = clamp(values.size, 0.65, 1.5);
  if (values.opacity !== undefined) settings.opacity = clamp(values.opacity, 0.25, 1);
  saveControlSettings();
}

export function updateKeyBinding(action: ActionId, key: string) {
  const previous = settings.keys[action];
  const conflictingAction = ACTION_IDS.find((candidate) => candidate !== action && settings.keys[candidate] === key);
  if (conflictingAction) settings.keys[conflictingAction] = previous;
  settings.keys[action] = key;
  saveControlSettings();
}

export function resetControlSettings() {
  settings = structuredClone(defaults);
  saveControlSettings();
}

export const CONTROL_IDS = Object.keys(defaultLayout) as ControlId[];
export const ACTION_IDS = Object.keys(defaultKeys) as ActionId[];
export const CONTROL_LABELS: Record<ControlId, string> = {
  joystick: 'MOVE', attack: 'FIRE', fly: 'JET', bomb: 'BOMB', reload: 'RELOAD',
  pickup: 'PICKUP', slot1: '1', slot2: '2', slot3: '3',
};
export const ACTION_LABELS: Record<ActionId, string> = {
  left: 'Move left', right: 'Move right', fly: 'Fly / jump', flyAlt: 'Alternate fly / jump', fire: 'Attack',
  bomb: 'Throw bomb', reload: 'Reload', pickup: 'Pick up / swap',
  nextWeapon: 'Next weapon', slot1: 'Weapon slot 1', slot2: 'Weapon slot 2',
  slot3: 'Weapon slot 3', mute: 'Mute sound',
};
