// Persistent progress. Stored locally on the device — the game has no
// accounts and sends nothing anywhere.

import { HEROES, META } from './data';

export interface SaveData {
  version: 1;
  coins: number;
  gems: number;
  highestArea: number; // highest area unlocked (1-based)
  bestSurvival: number; // seconds
  heroLevels: Record<string, number>; // 0 = locked
  squad: string[]; // hero ids chosen for the next run, in slot order
  meta: Record<string, number>;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  tutorialDone: boolean;
  lastDaily: string; // yyyy-mm-dd of last daily reward claim
}

const KEY = 'idolsquad.save.v1';

function fresh(): SaveData {
  const heroLevels: Record<string, number> = {};
  for (const h of HEROES) heroLevels[h.id] = h.unlockCost === 0 ? 1 : 0;
  const meta: Record<string, number> = {};
  for (const m of META) meta[m.id] = 0;
  return {
    version: 1,
    coins: 0,
    gems: 0,
    highestArea: 1,
    bestSurvival: 0,
    heroLevels,
    squad: ['riya', 'kai'],
    meta,
    sound: true,
    music: true,
    haptics: true,
    tutorialDone: false,
    lastDaily: '',
  };
}

function load(): SaveData {
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...data,
      heroLevels: { ...base.heroLevels, ...(data.heroLevels || {}) },
      meta: { ...base.meta, ...(data.meta || {}) },
    };
  } catch {
    return base;
  }
}

export const save: SaveData = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or unavailable — progress for this session still works.
  }
}

export function resetSave() {
  Object.assign(save, fresh());
  persist();
}

export function unlockedHeroes() {
  return HEROES.filter((h) => save.heroLevels[h.id] > 0);
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
